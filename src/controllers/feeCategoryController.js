// src/controllers/feeCategoryController.js
const FeeCategory = require('../models/FeeCategory');
const { FeeStructure } = require('../models/Fee');
const mongoose = require('mongoose');

// @desc    Initialize default categories for a tenant
// @route   POST /api/admin/fees/categories/init
// @access  Private/Admin
const initializeDefaultCategories = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const tenantId = req.user.tenant._id;
    
    // Check if categories already exist for this tenant
    const existingCount = await FeeCategory.countDocuments({ 
      tenant: tenantId,
      isSystem: true 
    });
    
    if (existingCount > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Default categories already initialized'
      });
    }
    
    // Get default categories
    const defaultCategories = FeeCategory.getDefaultCategories();
    
    // Add tenant ID to each category
    const categoriesWithTenant = defaultCategories.map(cat => ({
      ...cat,
      tenant: tenantId
    }));
    
    // Create all default categories
    const created = await FeeCategory.create(categoriesWithTenant, { session });
    
    await session.commitTransaction();
    
    res.status(201).json({
      success: true,
      message: 'Default categories initialized successfully',
      count: created.length,
      data: created
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({
      success: false,
      message: 'Error initializing categories',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// @desc    Get all fee categories
// @route   GET /api/admin/fees/categories
// @access  Private/Admin
const getFeeCategories = async (req, res) => {
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
    
    const categories = await FeeCategory.find(query)
      .sort({ displayOrder: 1, name: 1 });
    
    // Get usage count for each category
    const categoriesWithUsage = await Promise.all(
      categories.map(async (category) => {
        const usageCount = await FeeStructure.countDocuments({
          tenant: req.user.tenant._id,
          category: category._id
        });
        
        return {
          ...category.toObject(),
          usageCount
        };
      })
    );
    
    res.status(200).json({
      success: true,
      count: categoriesWithUsage.length,
      data: categoriesWithUsage
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching categories',
      error: error.message
    });
  }
};

// @desc    Create a new fee category
// @route   POST /api/admin/fees/categories
// @access  Private/Admin
const createFeeCategory = async (req, res) => {
  try {
    const { name, code, description, displayOrder } = req.body;
    
    // Check if category with same name or code already exists
    const existing = await FeeCategory.findOne({
      tenant: req.user.tenant._id,
      $or: [
        { name: new RegExp(`^${name}$`, 'i') },
        { code: code ? code.toUpperCase() : undefined }
      ]
    });
    
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Category with this name or code already exists'
      });
    }
    
    const categoryData = {
      tenant: req.user.tenant._id,
      name,
      description,
      displayOrder: displayOrder || 999,
      isSystem: false // Custom categories are never system categories
    };
    
    // Only add code if explicitly provided
    if (code) {
      categoryData.code = code;
    }
    
    const category = await FeeCategory.create(categoryData);
    
    res.status(201).json({
      success: true,
      data: category,
      message: 'Category created successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error creating category',
      error: error.message
    });
  }
};

// @desc    Update a fee category
// @route   PUT /api/admin/fees/categories/:id
// @access  Private/Admin
const updateFeeCategory = async (req, res) => {
  try {
    const { name, description, displayOrder, isActive } = req.body;
    
    const category = await FeeCategory.findOne({
      _id: req.params.id,
      tenant: req.user.tenant._id
    });
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }
    
    // Don't allow updating system categories except for active status
    if (category.isSystem && (name || description || displayOrder)) {
      return res.status(400).json({
        success: false,
        message: 'System categories can only be activated/deactivated'
      });
    }
    
    // Check if new name already exists
    if (name && name !== category.name) {
      const existing = await FeeCategory.findOne({
        tenant: req.user.tenant._id,
        name: new RegExp(`^${name}$`, 'i'),
        _id: { $ne: req.params.id }
      });
      
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Category with this name already exists'
        });
      }
    }
    
    // Update fields
    if (name) category.name = name;
    if (description !== undefined) category.description = description;
    if (displayOrder !== undefined) category.displayOrder = displayOrder;
    if (isActive !== undefined) category.isActive = isActive;
    
    await category.save();
    
    res.status(200).json({
      success: true,
      data: category,
      message: 'Category updated successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating category',
      error: error.message
    });
  }
};

// @desc    Delete a fee category
// @route   DELETE /api/admin/fees/categories/:id
// @access  Private/Admin
const deleteFeeCategory = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const category = await FeeCategory.findOne({
      _id: req.params.id,
      tenant: req.user.tenant._id
    }).session(session);
    
    if (!category) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }
    
    // Check if category can be deleted
    const { canDelete, reason } = await category.canDelete();
    
    if (!canDelete) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: reason
      });
    }
    
    await category.deleteOne({ session });
    
    await session.commitTransaction();
    
    res.status(200).json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({
      success: false,
      message: 'Error deleting category',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// @desc    Get categories for dropdown (simplified list)
// @route   GET /api/admin/fees/categories/dropdown
// @access  Private/Admin
const getCategoriesDropdown = async (req, res) => {
  try {
    const categories = await FeeCategory.find({
      tenant: req.user.tenant._id,
      isActive: true
    })
    .select('name code displayOrder')
    .sort({ displayOrder: 1, name: 1 });
    
    const dropdown = categories.map(cat => ({
      label: cat.name,
      value: cat.code,
      order: cat.displayOrder
    }));
    
    res.status(200).json({
      success: true,
      data: dropdown
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching categories',
      error: error.message
    });
  }
};

module.exports = {
  initializeDefaultCategories,
  getFeeCategories,
  createFeeCategory,
  updateFeeCategory,
  deleteFeeCategory,
  getCategoriesDropdown
};