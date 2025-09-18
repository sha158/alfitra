// test_fee_migration.js - Test script for fee migration scenario
const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const { FeeStructure, FeeAssignment, FeePayment } = require('./src/models/Fee');
const FeeCredit = require('./src/models/FeeCredit');
const FeeCategory = require('./src/models/FeeCategory');
const Student = require('./src/models/Student');
const Class = require('./src/models/Class');
const User = require('./src/models/User');
const Tenant = require('./src/models/Tenant');
const FeeMigrationService = require('./src/utils/feeMigration');

// Test scenario configuration
const SCENARIO = {
  totalOriginalFees: 30000, // ₹20,000 class + ₹10,000 van
  classFee: 20000,
  vanFee: 10000,
  paidAmount: 10000, // Student paid ₹10,000
  newClassFee: 30000, // New class fee is ₹30,000
  expectedResult: {
    totalOwed: 40000, // ₹30,000 new class + ₹10,000 van = ₹40,000
    creditApplied: 10000, // ₹10,000 should be applied as credit
    remainingDue: 30000 // ₹40,000 - ₹10,000 credit = ₹30,000 remaining to pay
  }
};

class FeeMigrationTest {
  constructor() {
    this.testData = {};
  }

  async connectDB() {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('📚 Connected to test database');
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      process.exit(1);
    }
  }

  async disconnectDB() {
    await mongoose.disconnect();
    console.log('📚 Disconnected from database');
  }

  async setupTestData() {
    console.log('\n🔧 Setting up test data...');

    try {
      // Create tenant
      this.testData.tenant = await Tenant.create({
        name: 'Test School',
        code: 'test-school',
        email: 'admin@testschool.com',
        phone: '1234567890',
        address: {
          city: 'Test City',
          state: 'Test State',
          country: 'India'
        },
        settings: { academicYear: '2024-2025' }
      });

      // Create fee categories
      const categories = await FeeCategory.create([
        {
          tenant: this.testData.tenant._id,
          name: 'Tuition Fee',
          code: 'TUITION',
          isSystem: true
        },
        {
          tenant: this.testData.tenant._id,
          name: 'Transport Fee',
          code: 'TRANSPORT',
          isSystem: true
        }
      ]);

      this.testData.tuitionCategory = categories[0];
      this.testData.transportCategory = categories[1];

      // Create admin user
      this.testData.admin = await User.create({
        tenant: this.testData.tenant._id,
        firstName: 'Test',
        lastName: 'Admin',
        email: 'admin@testschool.com',
        phone: '1234567890',
        password: 'password123',
        role: 'admin',
        isActive: true
      });

      // Create parent user
      this.testData.parent = await User.create({
        tenant: this.testData.tenant._id,
        firstName: 'Test',
        lastName: 'Parent',
        email: 'parent@testschool.com',
        phone: '1234567891',
        password: 'password123',
        role: 'parent',
        isActive: true
      });

      // Create classes
      this.testData.oldClass = await Class.create({
        tenant: this.testData.tenant._id,
        name: 'Class 5',
        section: 'A',
        displayName: 'Class 5-A',
        classTeacher: this.testData.admin._id,
        academicYear: '2024-2025',
        subjectTeachers: [{
          subject: 'Mathematics',
          teacher: this.testData.admin._id
        }],
        isActive: true
      });

      this.testData.newClass = await Class.create({
        tenant: this.testData.tenant._id,
        name: 'Class 6',
        section: 'A',
        displayName: 'Class 6-A',
        classTeacher: this.testData.admin._id,
        academicYear: '2024-2025',
        subjectTeachers: [{
          subject: 'Mathematics',
          teacher: this.testData.admin._id
        }],
        isActive: true
      });

      // Create student
      this.testData.student = await Student.create({
        tenant: this.testData.tenant._id,
        firstName: 'Test',
        lastName: 'Student',
        dateOfBirth: new Date('2010-01-01'),
        gender: 'male',
        class: this.testData.oldClass._id,
        rollNumber: 1,
        admissionNumber: 'ADM001',
        parent: this.testData.parent._id,
        isActive: true
      });

      // Create fee structures for old class
      this.testData.oldClassTuitionFee = await FeeStructure.create({
        tenant: this.testData.tenant._id,
        name: 'Class 5 Tuition Fee',
        category: this.testData.tuitionCategory._id,
        classes: [this.testData.oldClass._id],
        amount: SCENARIO.classFee,
        academicYear: '2024-2025',
        isActive: true
      });

      this.testData.transportFee = await FeeStructure.create({
        tenant: this.testData.tenant._id,
        name: 'Van Transportation Fee',
        category: this.testData.transportCategory._id,
        classes: [this.testData.oldClass._id, this.testData.newClass._id], // Available to both classes
        amount: SCENARIO.vanFee,
        academicYear: '2024-2025',
        isActive: true
      });

      // Create fee structures for new class
      this.testData.newClassTuitionFee = await FeeStructure.create({
        tenant: this.testData.tenant._id,
        name: 'Class 6 Tuition Fee',
        category: this.testData.tuitionCategory._id,
        classes: [this.testData.newClass._id],
        amount: SCENARIO.newClassFee,
        academicYear: '2024-2025',
        isActive: true
      });

      console.log('✅ Test data setup complete');

    } catch (error) {
      console.error('❌ Error setting up test data:', error.message);
      throw error;
    }
  }

  async createInitialFeeAssignments() {
    console.log('\n💰 Creating initial fee assignments...');

    // Assign class 5 tuition fee
    this.testData.oldTuitionAssignment = await FeeAssignment.create({
      tenant: this.testData.tenant._id,
      student: this.testData.student._id,
      feeStructure: this.testData.oldClassTuitionFee._id,
      academicYear: '2024-2025',
      totalAmount: SCENARIO.classFee,
      finalAmount: SCENARIO.classFee,
      dueDate: new Date(),
      status: 'pending',
      paidAmount: 0
    });

    // Assign transport fee
    this.testData.transportAssignment = await FeeAssignment.create({
      tenant: this.testData.tenant._id,
      student: this.testData.student._id,
      feeStructure: this.testData.transportFee._id,
      academicYear: '2024-2025',
      totalAmount: SCENARIO.vanFee,
      finalAmount: SCENARIO.vanFee,
      dueDate: new Date(),
      status: 'pending',
      paidAmount: 0
    });

    console.log(`✅ Assigned fees: ₹${SCENARIO.classFee} (tuition) + ₹${SCENARIO.vanFee} (transport) = ₹${SCENARIO.totalOriginalFees}`);
  }

  async simulatePayment() {
    console.log('\n💸 Simulating student payment...');

    // According to the user's scenario: student paid ₹10,000 out of ₹30,000 total
    // This could be toward any fee. Let's say it was toward the class fee (partial payment)
    const partialPayment = await FeePayment.create({
      tenant: this.testData.tenant._id,
      student: this.testData.student._id,
      feeAssignment: this.testData.oldTuitionAssignment._id,
      amount: SCENARIO.paidAmount,
      paymentMethod: 'cash',
      collectedBy: this.testData.admin._id
    });

    // Update class fee assignment with partial payment
    this.testData.oldTuitionAssignment.paidAmount = SCENARIO.paidAmount;
    this.testData.oldTuitionAssignment.status = 'partially_paid';
    await this.testData.oldTuitionAssignment.save();

    console.log(`✅ Paid ₹${SCENARIO.paidAmount} toward class tuition fee (partial payment)`);
    console.log(`📊 Remaining class fee: ₹${SCENARIO.classFee - SCENARIO.paidAmount}`);
    console.log(`📊 Van fee: ₹${SCENARIO.vanFee} (still pending)`);
  }

  async performClassChange() {
    console.log('\n🔄 Performing class change with fee migration...');

    console.log(`📍 Changing student from ${this.testData.oldClass.displayName} to ${this.testData.newClass.displayName}`);

    // Use our migration service
    const migrationResult = await FeeMigrationService.handleClassChangeFeeMigration(
      this.testData.student._id,
      this.testData.oldClass._id,
      this.testData.newClass._id,
      this.testData.tenant._id,
      this.testData.admin._id
    );

    this.testData.migrationResult = migrationResult;

    console.log('\n📊 Migration Summary:');
    console.log(`   Credits Created: ₹${migrationResult.summary.totalCreditsCreated}`);
    console.log(`   Credits Applied: ₹${migrationResult.summary.totalCreditsApplied}`);
    console.log(`   New Fees Assigned: ${migrationResult.summary.newFeesAssigned}`);
    console.log(`   Preserved Fees: ${migrationResult.summary.preservedFees}`);

    return migrationResult;
  }

  async validateResults() {
    console.log('\n🔍 Validating results...');

    // Get final state (only active assignments)
    const finalAssignments = await FeeAssignment.find({
      tenant: this.testData.tenant._id,
      student: this.testData.student._id,
      status: { $ne: 'cancelled' }
    }).populate('feeStructure');

    // Also get cancelled assignments for debugging
    const cancelledAssignments = await FeeAssignment.find({
      tenant: this.testData.tenant._id,
      student: this.testData.student._id,
      status: 'cancelled'
    }).populate('feeStructure');

    console.log(`\n📋 Cancelled Assignments (${cancelledAssignments.length}):`);
    for (const assignment of cancelledAssignments) {
      console.log(`   ${assignment.feeStructure?.name}: ₹${assignment.finalAmount} [CANCELLED]`);
    }

    // Also get ALL assignments for debugging
    const allAssignments = await FeeAssignment.find({
      tenant: this.testData.tenant._id,
      student: this.testData.student._id
    }).populate('feeStructure');

    console.log(`\n📋 ALL Assignments (${allAssignments.length}):`);
    for (const assignment of allAssignments) {
      console.log(`   ${assignment.feeStructure?.name}: ₹${assignment.finalAmount} (Paid: ₹${assignment.paidAmount || 0}) [${assignment.status}]`);
    }

    const finalCredits = await FeeCredit.find({
      tenant: this.testData.tenant._id,
      student: this.testData.student._id
    });

    console.log('\n📋 Final Fee Assignments:');
    let totalPending = 0;
    let totalPaid = 0;

    for (const assignment of finalAssignments) {
      const pending = assignment.finalAmount - (assignment.paidAmount || 0);
      totalPending += pending;
      totalPaid += (assignment.paidAmount || 0);

      console.log(`   ${assignment.feeStructure.name}: ₹${assignment.finalAmount} (Paid: ₹${assignment.paidAmount || 0}, Pending: ₹${pending}) [${assignment.status}]`);
    }

    console.log('\n💳 Final Credits:');
    let totalAvailableCredit = 0;
    for (const credit of finalCredits) {
      console.log(`   Credit: ₹${credit.creditAmount} (Used: ₹${credit.usedAmount}, Remaining: ₹${credit.remainingAmount}) [${credit.status}]`);
      if (credit.status === 'active') {
        totalAvailableCredit += credit.remainingAmount;
      }
    }

    // Validation
    console.log('\n✅ Validation Results:');

    const expectedTotalDue = SCENARIO.expectedResult.remainingDue;
    const actualTotalDue = totalPending;

    console.log(`   Expected total due: ₹${expectedTotalDue}`);
    console.log(`   Actual total due: ₹${actualTotalDue}`);
    console.log(`   ✅ Match: ${expectedTotalDue === actualTotalDue ? 'YES' : 'NO'}`);

    console.log(`   Available credits: ₹${totalAvailableCredit}`);
    console.log(`   Total paid: ₹${totalPaid}`);

    // Check scenario expectations
    const tests = [
      {
        name: 'Transport fee preserved',
        expected: true,
        actual: finalAssignments.some(a => a.feeStructure.name.includes('Van Transportation'))
      },
      {
        name: 'New class tuition fee created',
        expected: true,
        actual: finalAssignments.some(a => a.feeStructure.name.includes('Class 6 Tuition'))
      },
      {
        name: 'Total amount due is correct',
        expected: SCENARIO.expectedResult.remainingDue,
        actual: totalPending
      }
    ];

    console.log('\n🧪 Test Results:');
    let allPassed = true;
    for (const test of tests) {
      const passed = test.expected === test.actual;
      console.log(`   ${passed ? '✅' : '❌'} ${test.name}: ${passed ? 'PASS' : 'FAIL'}`);
      if (!passed) {
        console.log(`      Expected: ${test.expected}, Got: ${test.actual}`);
        allPassed = false;
      }
    }

    return allPassed;
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up test data...');

    try {
      // Clear all test data more thoroughly
      if (this.testData.tenant) {
        await FeePayment.deleteMany({ tenant: this.testData.tenant._id });
        await FeeCredit.deleteMany({ tenant: this.testData.tenant._id });
        await FeeAssignment.deleteMany({ tenant: this.testData.tenant._id });
        await FeeStructure.deleteMany({ tenant: this.testData.tenant._id });
        await Student.deleteMany({ tenant: this.testData.tenant._id });
        await Class.deleteMany({ tenant: this.testData.tenant._id });
        await User.deleteMany({ tenant: this.testData.tenant._id });
        await FeeCategory.deleteMany({ tenant: this.testData.tenant._id });
        await Tenant.deleteMany({ _id: this.testData.tenant._id });
      }

      // Also clear any payments that might be from previous test runs
      await FeePayment.deleteMany({ receiptNumber: /^RCP2025/ });

      console.log('✅ Cleanup complete');
    } catch (error) {
      console.error('❌ Cleanup error:', error.message);
    }
  }

  async runTest() {
    console.log('🚀 Starting Fee Migration Test');
    console.log('=====================================');
    console.log(`📝 Scenario: Student paid ₹${SCENARIO.paidAmount} out of ₹${SCENARIO.totalOriginalFees}`);
    console.log(`🔄 Class change: New class fee ₹${SCENARIO.newClassFee}, Van fee ₹${SCENARIO.vanFee}`);
    console.log(`🎯 Expected result: ₹${SCENARIO.expectedResult.remainingDue} remaining due`);

    try {
      await this.connectDB();

      // Initial cleanup to ensure clean state
      await FeePayment.deleteMany({ receiptNumber: /^RCP2025/ });

      await this.setupTestData();
      await this.createInitialFeeAssignments();
      await this.simulatePayment();
      await this.performClassChange();
      const allTestsPassed = await this.validateResults();

      console.log('\n🏁 Test Summary');
      console.log('=====================================');
      if (allTestsPassed) {
        console.log('🎉 ALL TESTS PASSED! Fee migration working correctly.');
      } else {
        console.log('❌ SOME TESTS FAILED! Please check the implementation.');
      }

    } catch (error) {
      console.error('\n💥 Test failed with error:', error.message);
      console.error(error.stack);
    } finally {
      await this.cleanup();
      await this.disconnectDB();
    }
  }
}

// Run the test
if (require.main === module) {
  const test = new FeeMigrationTest();
  test.runTest().catch(console.error);
}

module.exports = FeeMigrationTest;