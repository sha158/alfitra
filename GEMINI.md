# Al-Fitrah Backend Coding Standards

This document outlines the coding standards, conventions, and best practices to be followed for the Al-Fitrah backend project. Adhering to these standards will help us maintain a clean, scalable, and performant codebase.

## 1. Code Style & Formatting

To ensure a consistent code style across the entire project, we will use **Prettier** for code formatting and **ESLint** for identifying and fixing stylistic and programmatic errors.

- **Formatting:** Run Prettier to format files before committing.
- **Linting:** Run ESLint to catch issues early.

### Key Style Rules:
- **Indentation:** 2 spaces.
- **Quotes:** Single quotes (`'`) for strings, unless template literals are needed.
- **Semicolons:** Always use semicolons at the end of statements.
- **Trailing Commas:** Use trailing commas for multi-line arrays and objects.
- **Line Length:** Keep lines under 120 characters where possible.

## 2. Naming Conventions

- **Variables & Functions:** `camelCase` (e.g., `studentName`, `getHifzRecords`).
- **Classes:** `PascalCase` (e.g., `class Student extends Model`).
- **Constants:** `UPPER_CASE_SNAKE_CASE` (e.g., `const PORT = 3000;`).
- **Files:** `camelCase.js` (e.g., `studentController.js`), consistent with the current project structure.

## 3. Project Structure

The existing project structure should be maintained:

- `src/`: Contains all the application source code.
  - `config/`: For configuration files (database, Firebase, etc.).
  - `controllers/`: For request/response handling logic (business logic).
  - `middleware/`: For Express middleware (auth, error handling, etc.).
  - `models/`: For database schemas and models.
  - `routes/`: For API route definitions.
  - `utils/`: For reusable utility functions (email service, token generator, etc.).

## 4. Asynchronous Code (Performance & Scalability)

- **Always use `async/await`** for asynchronous operations (database queries, file I/O, API calls). This makes the code non-blocking and more readable than callbacks or `.then()` chains.
- **Wrap route handlers** in a `try...catch` block or use an async middleware to pass errors to the global error handler.

**Example:**
```javascript
// src/controllers/studentController.js

exports.getStudentById = async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.status(200).json({ data: student });
  } catch (error) {
    next(error); // Pass error to the centralized error handler
  }
};
```

## 5. Error Handling

- Utilize the existing centralized error handler in `src/middleware/errorHandler.js`.
- Do not handle errors with `res.status().send()` inside a controller's `catch` block. Instead, call `next(error)`.
- Use specific HTTP status codes for responses.

## 6. API Design (RESTful Principles)

- **Stateless:** Each request should contain all the information needed to process it.
- **Resource-Based URLs:** Use nouns to represent resources (e.g., `/students`, `/fees`).
- **HTTP Verbs:** Use appropriate HTTP methods for actions:
  - `GET`: Retrieve resources.
  - `POST`: Create a new resource.
  - `PUT`/`PATCH`: Update an existing resource.
  - `DELETE`: Delete a resource.
- **Standard Response Structure:** Send consistent JSON responses.
  ```json
  {
    "status": "success", // or "error"
    "data": { ... }, // The response payload
    "message": "Optional message"
  }
  ```

## 7. Security

- **Environment Variables:** **NEVER** hardcode secrets or configuration details. Use a `.env` file for local development and environment variables in production.
  - **CRITICAL:** The `src/config/serviceAccountKey.json` file should **NOT** be committed to version control. It should be loaded securely via environment variables. Add `src/config/serviceAccountKey.json` to your `.gitignore` file immediately.
- **Input Validation:** Validate and sanitize all user input using a library like `Joi` or `express-validator` to prevent injection attacks.
- **Authentication & Authorization:** Continue using the JWT-based authentication (`src/middleware/auth.js`) and role checks (`src/middleware/rolecheck.js`). Ensure routes are protected appropriately.
- **Security Headers:** Use a library like `helmet` to set secure HTTP headers.

## 8. Database

- **Connection Pooling:** Ensure the database configuration in `src/config/database.js` uses a connection pool to efficiently manage database connections.
- **Indexing:** Add database indexes to fields that are frequently queried (e.g., foreign keys, user emails, lookup fields). This is crucial for query performance as the data grows.
- **Lean Queries:** When you only need to read data without modifying it, use `.lean()` with Mongoose queries to get plain JavaScript objects instead of full Mongoose documents. This significantly improves performance.
