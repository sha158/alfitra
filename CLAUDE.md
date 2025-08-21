# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Start development server**: `npm run dev` (uses nodemon for auto-restart)
- **Start production server**: `npm start` 
- **Install dependencies**: `npm install`

## Project Architecture

This is a Node.js/Express REST API for the Al Fitrah educational management system. It follows a modular MVC architecture:

### Core Structure
- **Entry point**: `server.js` - handles server startup and database connection
- **Application setup**: `src/app.js` - Express configuration, middleware, and route mounting
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT tokens with Firebase Admin SDK integration

### Directory Organization
```
src/
├── config/          # Configuration files (database, Firebase, constants)
├── controllers/     # Route handlers organized by user role
├── middleware/      # Authentication, authorization, error handling
├── models/          # Mongoose schemas and models
├── routes/          # Express route definitions by role
└── utils/           # Utility functions (email, file upload, passwords)
```

### Key Architecture Patterns
- **Role-based routing**: Separate route files for admin, teacher, parent, superadmin
- **Middleware chain**: Authentication → tenant check → role validation → controller
- **Multi-tenant support**: Tenant-aware data isolation via `tenantCheck.js`
- **Firebase integration**: Push notifications and file storage capabilities
- **File upload handling**: Multer for handling notes and document uploads

### Environment Configuration
Required `.env` variables:
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - JWT signing key
- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (defaults to 5000)

### API Structure
- Base URL: `/api`
- Role-specific endpoints: `/api/admin`, `/api/teacher`, `/api/parent`
- Common endpoints: `/api/auth`, `/api/hifz`
- Health check: `/health`

### Models and Features
Core entities include User, Student, Class, Attendance, Homework, Fee, HifzTracker, Notification, and Announcement with full CRUD operations and role-based access control.