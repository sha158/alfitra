// src/utils/feeMigration.js
const { FeeStructure, FeeAssignment } = require('../models/Fee');
const FeeCredit = require('../models/FeeCredit');
const FeeCategory = require('../models/FeeCategory');
const { FEE_STATUS } = require('../config/constants');

/**
 * Smart fee migration when student changes class
 * Handles category-based fee migration with credit system
 */
class FeeMigrationService {

  /**
   * Main function to handle class change fee migration
   */
  static async handleClassChangeFeeMigration(studentId, oldClassId, newClassId, tenantId, userId) {
    console.log(`=== Starting Fee Migration ===`);
    console.log(`Student: ${studentId}`);
    console.log(`Old Class: ${oldClassId}`);
    console.log(`New Class: ${newClassId}`);
    console.log(`Tenant: ${tenantId}`);

    const migrationResult = {
      cancelledAssignments: [],
      preservedAssignments: [],
      newAssignments: [],
      creditsCreated: [],
      creditsApplied: [],
      summary: {
        totalCreditsCreated: 0,
        totalCreditsApplied: 0,
        newFeesAssigned: 0,
        preservedFees: 0
      }
    };

    try {
      // Step 1: Get all current fee assignments for the student
      console.log('\n--- Step 1: Getting current fee assignments ---');
      const currentAssignments = await FeeAssignment.find({
        student: studentId,
        tenant: tenantId,
        status: { $ne: 'cancelled' }
      }).populate('feeStructure');

      console.log(`Found ${currentAssignments.length} current assignments:`);
      currentAssignments.forEach((assignment, index) => {
        console.log(`  ${index + 1}. ${assignment.feeStructure?.name || 'Unknown'} - ₹${assignment.finalAmount} (Paid: ₹${assignment.paidAmount || 0}) [Status: ${assignment.status}]`);
      });

      // Step 2: Process each assignment based on category
      console.log('\n--- Step 2: Processing assignments by category ---');
      for (const assignment of currentAssignments) {
        console.log(`Processing assignment: ${assignment.feeStructure?.name} (${assignment.feeStructure?.category})`);
        await this.processAssignmentByCategory(
          assignment,
          oldClassId,
          newClassId,
          tenantId,
          userId,
          migrationResult
        );
      }

      // Step 3: Auto-assign new class fees
      console.log('\n--- Step 3: Auto-assigning new class fees ---');
      await this.assignNewClassFees(
        studentId,
        newClassId,
        tenantId,
        userId,
        migrationResult
      );

      // Step 4: Apply available credits to new assignments
      console.log('\n--- Step 4: Applying available credits ---');
      await this.applyAvailableCredits(
        studentId,
        tenantId,
        migrationResult
      );

      console.log(`=== Migration Complete ===`);
      console.log(`Credits Created: ${migrationResult.summary.totalCreditsCreated}`);
      console.log(`Credits Applied: ${migrationResult.summary.totalCreditsApplied}`);
      console.log(`New Fees: ${migrationResult.summary.newFeesAssigned}`);
      console.log(`Preserved Fees: ${migrationResult.summary.preservedFees}`);

      return migrationResult;

    } catch (error) {
      console.error('Error in fee migration:', error);
      throw new Error(`Fee migration failed: ${error.message}`);
    }
  }

  /**
   * Process individual assignment based on its category
   */
  static async processAssignmentByCategory(assignment, oldClassId, newClassId, tenantId, userId, migrationResult) {
    const category = assignment.feeStructure?.category;
    const paidAmount = assignment.paidAmount || 0;

    console.log(`\nProcessing assignment: ${assignment.feeStructure?.name}`);
    console.log(`Category: ${category}`);
    console.log(`Paid Amount: ${paidAmount}`);
    console.log(`Final Amount: ${assignment.finalAmount}`);

    // Get category information by ObjectId
    const categoryInfo = await FeeCategory.findOne({
      tenant: tenantId,
      _id: category
    });

    const categoryCode = categoryInfo?.code || category;
    console.log(`Category Code: ${categoryCode}`);

    if (this.isCategoryPreservedAcrossClasses(categoryCode)) {
      // Keep transport, library, and other shared fees as-is
      console.log(`✓ Preserving ${categoryCode} fee (shared across classes)`);
      migrationResult.preservedAssignments.push({
        assignmentId: assignment._id,
        feeName: assignment.feeStructure.name,
        category: categoryCode,
        reason: 'Category preserved across classes'
      });
      migrationResult.summary.preservedFees += 1;

    } else {
      // Handle class-specific fees (tuition, lab, etc.)
      await this.migrateClassSpecificFee(
        assignment,
        newClassId,
        tenantId,
        userId,
        migrationResult
      );
    }
  }

  /**
   * Check if category should be preserved across class changes
   */
  static isCategoryPreservedAcrossClasses(categoryCode) {
    const preservedCategories = [
      'TRANSPORT',
      'LIBRARY',
      'SPORTS',
      'OTHER'
    ];
    return preservedCategories.includes(categoryCode?.toUpperCase());
  }

  /**
   * Migrate class-specific fees (tuition, lab, etc.)
   */
  static async migrateClassSpecificFee(assignment, newClassId, tenantId, userId, migrationResult) {
    const paidAmount = assignment.paidAmount || 0;
    const category = assignment.feeStructure?.category;

    console.log(`Migrating class-specific fee: ${assignment.feeStructure?.name}`);

    // Step 1: Cancel old assignment
    const cancellationResult = await FeeAssignment.findByIdAndUpdate(
      assignment._id,
      {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: userId,
        cancellationReason: `Class change - fee migrated to new class`
      },
      { new: true }
    );

    console.log(`✓ Cancelled old assignment: ${assignment.feeStructure?.name} (status: ${cancellationResult.status})`);

    migrationResult.cancelledAssignments.push({
      assignmentId: assignment._id,
      feeName: assignment.feeStructure.name,
      paidAmount: paidAmount,
      finalAmount: assignment.finalAmount
    });

    // Step 2: Create credit if payment was made
    if (paidAmount > 0) {
      const credit = await FeeCredit.create({
        tenant: tenantId,
        student: assignment.student,
        originalAssignment: assignment._id,
        creditAmount: paidAmount,
        usedAmount: 0,
        remainingAmount: paidAmount,
        reason: 'class_change_overpayment',
        reasonDetails: `Credit created from cancelled ${assignment.feeStructure.name} due to class change`,
        createdBy: userId
      });

      migrationResult.creditsCreated.push({
        creditId: credit._id,
        amount: paidAmount,
        reason: credit.reason,
        originalFee: assignment.feeStructure.name
      });

      migrationResult.summary.totalCreditsCreated += paidAmount;

      console.log(`✓ Created credit of ${paidAmount} for cancelled fee`);
    }

    // Step 3: Find equivalent fee structure in new class
    const newFeeStructure = await FeeStructure.findOne({
      tenant: tenantId,
      category: category,
      classes: newClassId,
      isActive: true
    });

    if (newFeeStructure) {
      // Create new assignment for new class
      const newAssignment = await FeeAssignment.create({
        tenant: tenantId,
        student: assignment.student,
        feeStructure: newFeeStructure._id,
        academicYear: newFeeStructure.academicYear,
        totalAmount: newFeeStructure.amount,
        discount: { amount: 0 },
        finalAmount: newFeeStructure.amount,
        dueDate: this.calculateDueDate(newFeeStructure.frequency, newFeeStructure.dueDate),
        status: FEE_STATUS.PENDING,
        paidAmount: 0
      });

      console.log(`✓ Created new assignment: ${newFeeStructure.name} (₹${newFeeStructure.amount}, ID: ${newAssignment._id})`);

      migrationResult.newAssignments.push({
        assignmentId: newAssignment._id,
        feeName: newFeeStructure.name,
        category: category,
        amount: newFeeStructure.amount,
        oldAmount: assignment.finalAmount,
        creditAvailable: paidAmount
      });

      migrationResult.summary.newFeesAssigned += 1;

      console.log(`✓ Created new assignment: ${newFeeStructure.name} (${newFeeStructure.amount})`);
    } else {
      console.log(`⚠ No equivalent fee structure found in new class for category: ${category}`);
    }
  }

  /**
   * Auto-assign new class fees that don't exist in old class
   */
  static async assignNewClassFees(studentId, newClassId, tenantId, userId, migrationResult) {
    console.log(`\nChecking for new class-specific fees...`);
    console.log(`Student ID: ${studentId}`);
    console.log(`New Class ID: ${newClassId}`);
    console.log(`Tenant ID: ${tenantId}`);

    // Get all fee structures for new class
    const newClassFeeStructures = await FeeStructure.find({
      tenant: tenantId,
      classes: newClassId,
      isActive: true
    });

    console.log(`Found ${newClassFeeStructures.length} fee structures for new class:`);
    newClassFeeStructures.forEach((fs, index) => {
      console.log(`  ${index + 1}. ${fs.name} - ₹${fs.amount} (Category: ${fs.category})`);
    });

    if (newClassFeeStructures.length === 0) {
      console.log('⚠️ WARNING: No fee structures found for the new class!');
      console.log('This might be why fees are not being assigned.');
      return;
    }

    // Get student's current ACTIVE assignments (excluding cancelled ones)
    const currentAssignments = await FeeAssignment.find({
      student: studentId,
      tenant: tenantId,
      status: { $ne: 'cancelled' }
    }).populate('feeStructure');

    console.log(`Found ${currentAssignments.length} current active assignments:`);
    currentAssignments.forEach((assignment, index) => {
      console.log(`  ${index + 1}. ${assignment.feeStructure?.name || 'Unknown'} (Category: ${assignment.feeStructure?.category})`);
    });

    const existingCategories = new Set();

    // Only include non-cancelled assignments in the existing categories check
    currentAssignments.forEach(assignment => {
      if (assignment.feeStructure && assignment.status !== 'cancelled') {
        existingCategories.add(assignment.feeStructure.category.toString());
      }
    });

    console.log(`Existing categories: [${Array.from(existingCategories).join(', ')}]`);

    for (const feeStructure of newClassFeeStructures) {
      const category = feeStructure.category.toString();

      console.log(`\n🔍 Checking fee structure: ${feeStructure.name}, category: ${category}`);
      console.log(`   Amount: ₹${feeStructure.amount}`);
      console.log(`   Category exists in student's current assignments: ${existingCategories.has(category)}`);

      // Skip if we already have this category assigned (and not cancelled)
      if (existingCategories.has(category)) {
        console.log(`   ⏭️ Skipping ${feeStructure.name} - category already exists`);
        continue;
      }

      console.log(`   ✅ Will create new assignment for ${feeStructure.name}`);

      // Create new assignment
      const newAssignment = await FeeAssignment.create({
        tenant: tenantId,
        student: studentId,
        feeStructure: feeStructure._id,
        academicYear: feeStructure.academicYear,
        totalAmount: feeStructure.amount,
        discount: { amount: 0 },
        finalAmount: feeStructure.amount,
        dueDate: this.calculateDueDate(feeStructure.frequency, feeStructure.dueDate),
        status: FEE_STATUS.PENDING,
        paidAmount: 0
      });

      console.log(`✓ Added new fee: ${feeStructure.name} (₹${feeStructure.amount}, ID: ${newAssignment._id})`);

      migrationResult.newAssignments.push({
        assignmentId: newAssignment._id,
        feeName: feeStructure.name,
        category: category,
        amount: feeStructure.amount,
        oldAmount: 0,
        creditAvailable: 0,
        isNewCategory: true
      });

      migrationResult.summary.newFeesAssigned += 1;
    }
  }

  /**
   * Apply available credits to new assignments automatically
   */
  static async applyAvailableCredits(studentId, tenantId, migrationResult) {
    console.log(`\nApplying available credits...`);

    // Get all available credits for the student (including those just created)
    const availableCredits = await FeeCredit.getAvailableCredits(tenantId, studentId);

    if (availableCredits.length === 0) {
      console.log('No available credits to apply');
      return;
    }

    console.log(`Found ${availableCredits.length} available credits totaling: ₹${availableCredits.reduce((sum, c) => sum + c.remainingAmount, 0)}`);

    // Get ALL pending assignments for the student (not just new ones)
    // This ensures credits are applied to any unpaid fees
    const pendingAssignments = await FeeAssignment.find({
      student: studentId,
      tenant: tenantId,
      status: { $in: [FEE_STATUS.PENDING, FEE_STATUS.PARTIALLY_PAID] }
    }).populate('feeStructure').sort({ dueDate: 1 }); // Apply to earliest due dates first

    console.log(`Found ${pendingAssignments.length} pending assignments for credit application:`);

    let totalCreditsApplied = 0;

    for (const assignment of pendingAssignments) {
      let pendingAmount = assignment.finalAmount - (assignment.paidAmount || 0);

      console.log(`  ${assignment.feeStructure?.name}: pending ₹${pendingAmount}`);

      if (pendingAmount <= 0) continue;

      // Apply credits FIFO until assignment is paid or no credits left
      for (const credit of availableCredits) {
        if (credit.remainingAmount <= 0) continue;

        // Recalculate pending amount after each credit application
        pendingAmount = assignment.finalAmount - (assignment.paidAmount || 0);

        if (pendingAmount <= 0) break; // Assignment fully paid, move to next assignment

        const amountToApply = Math.min(pendingAmount, credit.remainingAmount);

        if (amountToApply > 0) {
          try {
            // Apply the credit
            await credit.applyCredit(assignment._id, amountToApply);

            // Update assignment - ensure we're working with the latest data
            const updatedAssignment = await FeeAssignment.findById(assignment._id);
            updatedAssignment.paidAmount = (updatedAssignment.paidAmount || 0) + amountToApply;
            updatedAssignment.updateStatus();
            await updatedAssignment.save();

            migrationResult.creditsApplied.push({
              creditId: credit._id,
              assignmentId: assignment._id,
              feeName: assignment.feeStructure?.name,
              amountApplied: amountToApply
            });

            totalCreditsApplied += amountToApply;

            console.log(`✓ Applied ₹${amountToApply} credit to ${assignment.feeStructure?.name} (remaining: ₹${updatedAssignment.finalAmount - updatedAssignment.paidAmount})`);

            // Update credit in availableCredits array for next iteration
            credit.remainingAmount -= amountToApply;
            credit.usedAmount += amountToApply;

            // Update the assignment object in our loop for correct calculations
            assignment.paidAmount = updatedAssignment.paidAmount;

          } catch (error) {
            console.error(`Error applying credit: ${error.message}`);
          }
        }
      }
    }

    migrationResult.summary.totalCreditsApplied = totalCreditsApplied;
    console.log(`Total credits applied: ₹${totalCreditsApplied}`);
  }

  /**
   * Calculate due date for fee assignment
   */
  static calculateDueDate(frequency, dueDateDay = 10) {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();

    let dueDate = new Date(currentYear, currentMonth, dueDateDay);

    if (dueDate < currentDate) {
      dueDate = new Date(currentYear, currentMonth + 1, dueDateDay);
    }

    return dueDate;
  }

  /**
   * Get migration summary for a student
   */
  static async getMigrationSummary(studentId, tenantId) {
    const availableCredits = await FeeCredit.find({
      student: studentId,
      tenant: tenantId,
      status: 'active'
    });

    const assignments = await FeeAssignment.find({
      student: studentId,
      tenant: tenantId,
      status: { $ne: 'cancelled' }
    }).populate('feeStructure');

    return {
      totalAvailableCredit: availableCredits.reduce((sum, c) => sum + c.remainingAmount, 0),
      totalPendingFees: assignments.reduce((sum, a) => sum + (a.finalAmount - a.paidAmount), 0),
      credits: availableCredits,
      assignments: assignments
    };
  }
}

module.exports = FeeMigrationService;