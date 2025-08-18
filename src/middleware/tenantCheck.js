// src/middleware/tenantCheck.js
const mongoose = require('mongoose');

// Ensure user can only access their tenant's data
const ensureTenant = (req, res, next) => {
  if (!req.user || !req.user.tenant) {
    return res.status(403).json({
      success: false,
      message: 'Tenant information missing'
    });
  }
  
  // Add tenant to request for easy access
  req.tenantId = req.user.tenant._id || req.user.tenant;
  next();
};

// Validate tenant ID in request params
const validateTenantAccess = (paramName = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[paramName];
      
      if (!resourceId) {
        return next();
      }
      
      // This will be used to check if the resource belongs to user's tenant
      // We'll implement this check in each controller based on the model
      req.resourceId = resourceId;
      next();
    } catch (error) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
  };
};

// Add tenant filter to all queries
const addTenantFilter = (req, res, next) => {
  // Store the original find methods
  const originalFind = mongoose.Query.prototype.find;
  const originalFindOne = mongoose.Query.prototype.findOne;
  const originalFindOneAndUpdate = mongoose.Query.prototype.findOneAndUpdate;
  
  // Override find methods to add tenant filter
  mongoose.Query.prototype.find = function() {
    if (req.tenantId && !this.getQuery().tenant) {
      this.where('tenant').equals(req.tenantId);
    }
    return originalFind.apply(this, arguments);
  };
  
  mongoose.Query.prototype.findOne = function() {
    if (req.tenantId && !this.getQuery().tenant) {
      this.where('tenant').equals(req.tenantId);
    }
    return originalFindOne.apply(this, arguments);
  };
  
  mongoose.Query.prototype.findOneAndUpdate = function() {
    if (req.tenantId && !this.getQuery().tenant) {
      this.where('tenant').equals(req.tenantId);
    }
    return originalFindOneAndUpdate.apply(this, arguments);
  };
  
  next();
};

// Verify resource belongs to tenant
const verifyResourceOwnership = (Model) => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params.id;
      
      if (!resourceId) {
        return next();
      }
      
      const resource = await Model.findById(resourceId);
      
      if (!resource) {
        return res.status(404).json({
          success: false,
          message: 'Resource not found'
        });
      }
      
      // Check if resource belongs to user's tenant
      if (resource.tenant && resource.tenant.toString() !== req.tenantId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      
      req.resource = resource;
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error verifying resource ownership'
      });
    }
  };
};

module.exports = {
  ensureTenant,
  validateTenantAccess,
  addTenantFilter,
  verifyResourceOwnership
};