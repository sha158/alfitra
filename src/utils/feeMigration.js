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

    // Start a database session for transaction consistency
    const mongoose = require('mongoose');
    const session = await mongoose.startSession();
    session.startTransaction();

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
      }).populate('feeStructure').session(session);

      console.log(`Found ${currentAssignments.length} current assignments:`);
      currentAssignments.forEach((assignment, index) => {
        console.log(`  ${index + 1}. ${assignment.feeStructure?.name || 'Unknown'} - ₹${assignment.finalAmount} (Paid: ₹${assignment.paidAmount || 0}) [Status: ${assignment.status}]`);
      });

      // Step 2: Cancel ALL old class assignments and create credits
      console.log('\n--- Step 2: Cancelling ALL old class assignments ---');
      for (const assignment of currentAssignments) {
        console.log(`Processing assignment: ${assignment.feeStructure?.name} (${assignment.feeStructure?.category})`);

        const paidAmount = assignment.paidAmount || 0;

        // Cancel the old assignment
        console.log(`Attempting to cancel assignment ID: ${assignment._id}`);

        const cancellationResult = await FeeAssignment.findByIdAndUpdate(
          assignment._id,
          {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancelledBy: userId,
            cancellationReason: `Class change from ${oldClassId} to ${newClassId}`
          },
          { new: true, session }
        );

        if (!cancellationResult) {
          console.error(`❌ FAILED to cancel assignment ${assignment._id} - assignment not found`);
        } else {
          console.log(`✓ Successfully cancelled assignment: ${assignment.feeStructure?.name} (status: ${cancellationResult.status})`);
          console.log(`   Assignment ID: ${cancellationResult._id}`);
          console.log(`   Cancelled at: ${cancellationResult.cancelledAt}`);
        }

        migrationResult.cancelledAssignments.push({
          assignmentId: assignment._id,
          feeName: assignment.feeStructure.name,
          paidAmount: paidAmount,
          finalAmount: assignment.finalAmount
        });

        // Create credit if payment was made
        if (paidAmount > 0) {
          const credit = await FeeCredit.create([{
            tenant: tenantId,
            student: assignment.student,
            originalAssignment: assignment._id,
            creditAmount: paidAmount,
            usedAmount: 0,
            remainingAmount: paidAmount,
            reason: 'class_change_overpayment',
            reasonDetails: `Credit created from cancelled ${assignment.feeStructure.name} due to class change`,
            createdBy: userId
          }], { session });

          const createdCredit = credit[0];

          migrationResult.creditsCreated.push({
            creditId: createdCredit._id,
            amount: paidAmount,
            reason: createdCredit.reason,
            originalFee: assignment.feeStructure.name
          });

          migrationResult.summary.totalCreditsCreated += paidAmount;

          console.log(`✓ Created credit of ₹${paidAmount} for cancelled fee`);
        }
      }

      // Step 3: Auto-assign new class fees
      console.log('\n--- Step 3: Auto-assigning new class fees ---');
      await this.assignNewClassFees(
        studentId,
        newClassId,
        tenantId,
        userId,
        migrationResult,
        session
      );

      // Step 4: Apply available credits to new assignments
      console.log('\n--- Step 4: Applying available credits ---');
      await this.applyAvailableCredits(
        studentId,
        tenantId,
        migrationResult,
        session
      );

      // Step 5: Verification - Ensure no old assignments are still active
      console.log('\n--- Step 5: Verification ---');
      const remainingActiveAssignments = await FeeAssignment.find({
        student: studentId,
        tenant: tenantId,
        status: { $ne: 'cancelled' }
      }).populate('feeStructure').session(session);

      console.log(`Found ${remainingActiveAssignments.length} active assignments after migration:`);
      remainingActiveAssignments.forEach((assignment, index) => {
        console.log(`  ${index + 1}. ${assignment.feeStructure?.name} - ₹${assignment.finalAmount} (Paid: ₹${assignment.paidAmount || 0}) [${assignment.status}]`);
      });

      console.log(`=== Migration Complete ===`);
      console.log(`Credits Created: ${migrationResult.summary.totalCreditsCreated}`);
      console.log(`Credits Applied: ${migrationResult.summary.totalCreditsApplied}`);
      console.log(`New Fees: ${migrationResult.summary.newFeesAssigned}`);
      console.log(`Preserved Fees: ${migrationResult.summary.preservedFees}`);

      // Commit the transaction
      await session.commitTransaction();
      console.log('✅ Transaction committed successfully');

      return migrationResult;

    } catch (error) {
      // Rollback the transaction on error
      await session.abortTransaction();
      console.error('❌ Transaction aborted due to error');
      console.error('Error in fee migration:', error);
      throw new Error(`Fee migration failed: ${error.message}`);
    } finally {
      session.endSession();
    }
  }


  /**
   * Auto-assign new class fees that don't exist in old class
   */
  static async assignNewClassFees(studentId, newClassId, tenantId, userId, migrationResult, session) {
    console.log(`\nChecking for new class-specific fees...`);
    console.log(`Student ID: ${studentId}`);
    console.log(`New Class ID: ${newClassId}`);
    console.log(`Tenant ID: ${tenantId}`);

    // Get all fee structures for new class
    const newClassFeeStructures = await FeeStructure.find({
      tenant: tenantId,
      classes: newClassId,
      isActive: true
    }).session(session);

    console.log(`Found ${newClassFeeStructures.length} fee structures for new class:`);
    newClassFeeStructures.forEach((fs, index) => {
      console.log(`  ${index + 1}. ${fs.name} - ₹${fs.amount} (Category: ${fs.category})`);
    });

    if (newClassFeeStructures.length === 0) {
      console.log('⚠️ WARNING: No fee structures found for the new class!');
      console.log('This might be why fees are not being assigned.');
      return;
    }

    // Since we cancelled all old class assignments in Step 2,
    // we need to create ALL fee structures for the new class
    console.log(`Creating assignments for ALL fee structures in the new class...`);

    for (const feeStructure of newClassFeeStructures) {
      const category = feeStructure.category ? feeStructure.category.toString() : 'NO_CATEGORY';

      console.log(`\n✅ Creating assignment for: ${feeStructure.name}, category: ${category}, amount: ₹${feeStructure.amount}`);

      // Create new assignment
      const newAssignment = await FeeAssignment.create([{
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
      }], { session });

      const createdAssignment = newAssignment[0];

      console.log(`✓ Added new fee: ${feeStructure.name} (₹${feeStructure.amount}, ID: ${createdAssignment._id})`);

      migrationResult.newAssignments.push({
        assignmentId: createdAssignment._id,
        feeName: feeStructure.name,
        category: category,
        amount: feeStructure.amount,
        oldAmount: 0,
        creditAvailable: 0,
        isNewClassAssignment: true
      });

      migrationResult.summary.newFeesAssigned += 1;
    }
  }

  /**
   * Apply available credits to new assignments automatically
   */
  static async applyAvailableCredits(studentId, tenantId, migrationResult, session) {
    console.log(`\nApplying available credits...`);

    // Get all available credits for the student (including those just created)
    const availableCredits = await FeeCredit.getAvailableCredits(tenantId, studentId);

    if (availableCredits.length === 0) {
      console.log('No available credits to apply');
      return;
    }

    const totalCreditsAvailable = availableCredits.reduce((sum, c) => sum + c.remainingAmount, 0);
    console.log(`Found ${availableCredits.length} available credits totaling: ₹${totalCreditsAvailable}`);

    // Get ALL pending assignments for the student (not just new ones)
    // This ensures credits are applied to any unpaid fees
    const pendingAssignments = await FeeAssignment.find({
      student: studentId,
      tenant: tenantId,
      status: { $in: [FEE_STATUS.PENDING, FEE_STATUS.PARTIALLY_PAID] }
    }).populate('feeStructure').sort({ dueDate: 1 }).session(session); // Apply to earliest due dates first

    console.log(`Found ${pendingAssignments.length} pending assignments for credit application:`);

    let totalPendingAmount = 0;
    pendingAssignments.forEach((assignment, index) => {
      const pendingForThis = assignment.finalAmount - (assignment.paidAmount || 0);
      totalPendingAmount += pendingForThis;
      console.log(`  ${index + 1}. ${assignment.feeStructure?.name} - ₹${assignment.finalAmount} (Paid: ₹${assignment.paidAmount || 0}, Pending: ₹${pendingForThis})`);
    });

    console.log(`Total pending amount before credit application: ₹${totalPendingAmount}`);

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
    console.log(`\n=== CREDIT APPLICATION SUMMARY ===`);
    console.log(`Total credits available: ₹${totalCreditsAvailable}`);
    console.log(`Total credits applied: ₹${totalCreditsApplied}`);
    console.log(`Remaining credits: ₹${totalCreditsAvailable - totalCreditsApplied}`);

    // Show final status of all assignments
    const finalAssignments = await FeeAssignment.find({
      student: studentId,
      tenant: tenantId,
      status: { $ne: 'cancelled' }
    }).populate('feeStructure');

    let finalTotalAmount = 0;
    let finalPaidAmount = 0;
    let finalPendingAmount = 0;

    console.log(`\n=== FINAL ASSIGNMENT STATUS ===`);
    finalAssignments.forEach((assignment, index) => {
      const pending = assignment.finalAmount - (assignment.paidAmount || 0);
      finalTotalAmount += assignment.finalAmount;
      finalPaidAmount += (assignment.paidAmount || 0);
      finalPendingAmount += pending;
      console.log(`  ${index + 1}. ${assignment.feeStructure?.name} - ₹${assignment.finalAmount} (Paid: ₹${assignment.paidAmount || 0}, Pending: ₹${pending}) [${assignment.status}]`);
    });

    console.log(`\n📊 TOTALS:`);
    console.log(`   Total Amount: ₹${finalTotalAmount}`);
    console.log(`   Paid Amount: ₹${finalPaidAmount}`);
    console.log(`   Pending Amount: ₹${finalPendingAmount}`);
    console.log(`================================`);
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