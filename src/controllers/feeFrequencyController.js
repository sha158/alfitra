// src/controllers/feeFrequencyController.js
const FeeFrequency = require('../models/FeeFrequency');
const { FeeStructure } = require('../models/Fee');
const mongoose = require('mongoose');

// @desc    Initialize default frequencies for a tenant
// @route   POST /api/admin/fees/frequencies/init
// @access  Private/Admin
const initializeDefaultFrequencies = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const tenantId = req.user.tenant._id;
    
    // Check if frequencies already exist for this tenant
    const existingCount = await FeeFrequency.countDocuments({ 
      tenant: tenantId,
      isSystem: true 
    });
    
    if (existingCount > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Default frequencies already initialized'
      });
    }
    
    // Get default frequencies
    const defaultFrequencies = FeeFrequency.getDefaultFrequencies();
    
    // Add tenant ID to each frequency
    const frequenciesWithTenant = defaultFrequencies.map(freq => ({
      ...freq,
      tenant: tenantId
    }));
    
    // Create all default frequencies
    const created = await FeeFrequency.create(frequenciesWithTenant, { session });
    
    await session.commitTransaction();
    
    res.status(201).json({
      success: true,
      message: 'Default frequencies initialized successfully',
      count: created.length,
      data: created
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({
      success: false,
      message: 'Error initializing frequencies',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// @desc    Get all fee frequencies
// @route   GET /api/admin/fees/frequencies
// @access  Private/Admin
const getFeeFrequencies = async (req, res) => {
  try {
    const { active, type } = req.query;
    
    const query = {
      tenant: req.user.tenant._id
    };
    
    // Filter by active status
    if (active !== undefined) {
      query.isActive = active === 'true';
    }
    
    // Filter by type (system or custom)
    if (type === 'system') {
      query.isSystem = true;
    } else if (type === 'custom') {
      query.isSystem = false;
    }
    
    const frequencies = await FeeFrequency.find(query)
      .sort({ displayOrder: 1, name: 1 });
    
    // Get usage count for each frequency
    const frequenciesWithUsage = await Promise.all(
      frequencies.map(async (frequency) => {
        const usageCount = await FeeStructure.countDocuments({
          tenant: req.user.tenant._id,
          frequency: frequency.code
        });
        
        return {
          ...frequency.toObject(),
          usageCount
        };
      })
    );
    
    res.status(200).json({
      success: true,
      count: frequenciesWithUsage.length,
      data: frequenciesWithUsage
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching frequencies',
      error: error.message
    });
  }
};

// @desc    Create a new fee frequency
// @route   POST /api/admin/fees/frequencies
// @access  Private/Admin
const createFeeFrequency = async (req, res) => {
  try {
    const { name, code, description, monthsInterval, displayOrder } = req.body;
    
    // Validate months interval
    if (monthsInterval === undefined || monthsInterval < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid months interval is required (0 for one-time, positive number for recurring)'
      });
    }
    
    // Check if frequency with same name or code already exists
    const existing = await FeeFrequency.findOne({
      tenant: req.user.tenant._id,
      $or: [
        { name: new RegExp(`^${name}$`, 'i') },
        { code: code ? code.toLowerCase() : undefined }
      ]
    });
    
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Frequency with this name or code already exists'
      });
    }
    
    const frequencyData = {
      tenant: req.user.tenant._id,
      name,
      description,
      monthsInterval,
      displayOrder: displayOrder || 999,
      isSystem: false
    };
    
    if (code) {
      frequencyData.code = code;
    }
    
    const frequency = await FeeFrequency.create(frequencyData);
    
    res.status(201).json({
      success: true,
      data: frequency,
      message: 'Frequency created successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error creating frequency',
      error: error.message
    });
  }
};

// @desc    Update a fee frequency
// @route   PUT /api/admin/fees/frequencies/:id
// @access  Private/Admin
const updateFeeFrequency = async (req, res) => {
  try {
    const { name, description, monthsInterval, displayOrder, isActive } = req.body;
    
    const frequency = await FeeFrequency.findOne({
      _id: req.params.id,
      tenant: req.user.tenant._id
    });
    
    if (!frequency) {
      return res.status(404).json({
        success: false,
        message: 'Frequency not found'
      });
    }
    
    // Don't allow updating system frequencies except for active status
    if (frequency.isSystem && (name || description || monthsInterval !== undefined || displayOrder)) {
      return res.status(400).json({
        success: false,
        message: 'System frequencies can only be activated/deactivated'
      });
    }
    
    // Check if new name already exists
    if (name && name !== frequency.name) {
      const existing = await FeeFrequency.findOne({
        tenant: req.user.tenant._id,
        name: new RegExp(`^${name}$`, 'i'),
        _id: { $ne: req.params.id }
      });
      
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Frequency with this name already exists'
        });
      }
    }
    
    // Update fields
    if (name) frequency.name = name;
    if (description !== undefined) frequency.description = description;
    if (monthsInterval !== undefined) frequency.monthsInterval = monthsInterval;
    if (displayOrder !== undefined) frequency.displayOrder = displayOrder;
    if (isActive !== undefined) frequency.isActive = isActive;
    
    await frequency.save();
    
    res.status(200).json({
      success: true,
      data: frequency,
      message: 'Frequency updated successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating frequency',
      error: error.message
    });
  }
};

// @desc    Delete a fee frequency
// @route   DELETE /api/admin/fees/frequencies/:id
// @access  Private/Admin
const deleteFeeFrequency = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const frequency = await FeeFrequency.findOne({
      _id: req.params.id,
      tenant: req.user.tenant._id
    }).session(session);
    
    if (!frequency) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Frequency not found'
      });
    }
    
    // Check if frequency can be deleted
    const { canDelete, reason } = await frequency.canDelete();
    
    if (!canDelete) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: reason
      });
    }
    
    await frequency.deleteOne({ session });
    
    await session.commitTransaction();
    
    res.status(200).json({
      success: true,
      message: 'Frequency deleted successfully'
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({
      success: false,
      message: 'Error deleting frequency',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// @desc    Get frequencies for dropdown (simplified list)
// @route   GET /api/admin/fees/frequencies/dropdown
// @access  Private/Admin
const getFrequenciesDropdown = async (req, res) => {
  try {
    const frequencies = await FeeFrequency.find({
      tenant: req.user.tenant._id,
      isActive: true
    })
    .select('name code monthsInterval displayOrder')
    .sort({ displayOrder: 1, name: 1 });
    
    const dropdown = frequencies.map(freq => ({
      label: freq.name,
      value: freq.code,
      monthsInterval: freq.monthsInterval,
      paymentsPerYear: freq.paymentsPerYear,
      order: freq.displayOrder
    }));
    
    res.status(200).json({
      success: true,
      data: dropdown
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching frequencies',
      error: error.message
    });
  }
};

module.exports = {
  initializeDefaultFrequencies,
  getFeeFrequencies,
  createFeeFrequency,
  updateFeeFrequency,
  deleteFeeFrequency,
  getFrequenciesDropdown
};