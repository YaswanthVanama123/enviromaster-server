import bcrypt from "bcryptjs";
import { AdminUser, Employee } from "../../models/user/index.js";
import logger from "../../utils/logger.js";

/**
 * List all users (admins + employees)
 */
export async function listUsers(req, res) {
  try {
    const { role, search, page = 1, limit = 50 } = req.query;

    // Fetch admins
    let admins = [];
    if (!role || role === 'admin') {
      const adminQuery = {};
      if (search) {
        adminQuery.username = { $regex: search, $options: 'i' };
      }
      admins = await AdminUser.find(adminQuery)
        .select('_id username isActive lastLoginAt createdAt updatedAt')
        .lean();

      admins = admins.map(a => ({
        id: a._id,
        username: a.username,
        fullName: a.username, // Admins don't have fullName, use username
        email: null,
        isActive: a.isActive,
        lastLoginAt: a.lastLoginAt,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        role: 'admin',
      }));
    }

    // Fetch employees
    let employees = [];
    if (!role || role === 'employee') {
      const employeeQuery = {};
      if (search) {
        employeeQuery.$or = [
          { username: { $regex: search, $options: 'i' } },
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ];
      }
      employees = await Employee.find(employeeQuery)
        .select('_id username fullName email isActive lastLoginAt createdAt updatedAt')
        .lean();

      employees = employees.map(e => ({
        id: e._id,
        username: e.username,
        fullName: e.fullName,
        email: e.email,
        isActive: e.isActive,
        lastLoginAt: e.lastLoginAt,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        role: 'employee',
      }));
    }

    // Combine and sort by createdAt descending
    const allUsers = [...admins, ...employees].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    // Pagination
    const total = allUsers.length;
    const startIndex = (page - 1) * limit;
    const paginatedUsers = allUsers.slice(startIndex, startIndex + parseInt(limit));

    res.json({
      success: true,
      users: paginatedUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    logger.error("listUsers error:", err);
    res.status(500).json({ error: "Failed to fetch users", detail: String(err) });
  }
}

/**
 * Create a new admin user
 */
export async function createAdmin(req, res) {
  try {
    const { username, password, isActive = true } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        error: "Bad Request",
        detail: "username and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Bad Request",
        detail: "Password must be at least 6 characters",
      });
    }

    // Check if username exists in either collection
    const existingAdmin = await AdminUser.findOne({ username }).lean();
    const existingEmployee = await Employee.findOne({ username }).lean();

    if (existingAdmin || existingEmployee) {
      return res.status(409).json({
        error: "Conflict",
        detail: "Username already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const admin = await AdminUser.create({
      username,
      passwordHash,
      isActive,
    });

    res.status(201).json({
      success: true,
      user: {
        id: admin._id,
        username: admin.username,
        fullName: admin.username,
        email: null,
        isActive: admin.isActive,
        role: 'admin',
        createdAt: admin.createdAt,
      },
    });
  } catch (err) {
    logger.error("createAdmin error:", err);
    res.status(500).json({ error: "Failed to create admin", detail: String(err) });
  }
}

/**
 * Create a new employee user
 */
export async function createEmployee(req, res) {
  try {
    const { username, password, fullName, email, isActive = true } = req.body || {};

    if (!username || !password || !fullName) {
      return res.status(400).json({
        error: "Bad Request",
        detail: "username, password, and fullName are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Bad Request",
        detail: "Password must be at least 6 characters",
      });
    }

    // Check if username exists in either collection
    const existingAdmin = await AdminUser.findOne({ username }).lean();
    const existingEmployee = await Employee.findOne({ username }).lean();

    if (existingAdmin || existingEmployee) {
      return res.status(409).json({
        error: "Conflict",
        detail: "Username already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const employee = await Employee.create({
      username,
      passwordHash,
      fullName,
      email,
      isActive,
    });

    res.status(201).json({
      success: true,
      user: {
        id: employee._id,
        username: employee.username,
        fullName: employee.fullName,
        email: employee.email,
        isActive: employee.isActive,
        role: 'employee',
        createdAt: employee.createdAt,
      },
    });
  } catch (err) {
    logger.error("createEmployee error:", err);
    res.status(500).json({ error: "Failed to create employee", detail: String(err) });
  }
}

/**
 * Update a user (admin or employee)
 */
export async function updateUser(req, res) {
  try {
    const { type, id } = req.params;
    const { username, fullName, email, isActive } = req.body || {};

    if (type !== 'admin' && type !== 'employee') {
      return res.status(400).json({
        error: "Bad Request",
        detail: "Invalid user type. Must be 'admin' or 'employee'",
      });
    }

    // Check if new username conflicts
    if (username) {
      const existingAdmin = await AdminUser.findOne({
        username,
        _id: { $ne: id }
      }).lean();
      const existingEmployee = await Employee.findOne({
        username,
        _id: { $ne: id }
      }).lean();

      if (existingAdmin || existingEmployee) {
        return res.status(409).json({
          error: "Conflict",
          detail: "Username already exists",
        });
      }
    }

    if (type === 'admin') {
      const updateData = {};
      if (username) updateData.username = username;
      if (typeof isActive === 'boolean') updateData.isActive = isActive;

      const admin = await AdminUser.findByIdAndUpdate(
        id,
        updateData,
        { new: true }
      ).select('_id username isActive lastLoginAt createdAt updatedAt');

      if (!admin) {
        return res.status(404).json({ error: "Not found", detail: "Admin not found" });
      }

      res.json({
        success: true,
        user: {
          id: admin._id,
          username: admin.username,
          fullName: admin.username,
          email: null,
          isActive: admin.isActive,
          role: 'admin',
          lastLoginAt: admin.lastLoginAt,
          createdAt: admin.createdAt,
          updatedAt: admin.updatedAt,
        },
      });
    } else {
      const updateData = {};
      if (username) updateData.username = username;
      if (fullName) updateData.fullName = fullName;
      if (email !== undefined) updateData.email = email;
      if (typeof isActive === 'boolean') updateData.isActive = isActive;

      const employee = await Employee.findByIdAndUpdate(
        id,
        updateData,
        { new: true }
      ).select('_id username fullName email isActive lastLoginAt createdAt updatedAt');

      if (!employee) {
        return res.status(404).json({ error: "Not found", detail: "Employee not found" });
      }

      res.json({
        success: true,
        user: {
          id: employee._id,
          username: employee.username,
          fullName: employee.fullName,
          email: employee.email,
          isActive: employee.isActive,
          role: 'employee',
          lastLoginAt: employee.lastLoginAt,
          createdAt: employee.createdAt,
          updatedAt: employee.updatedAt,
        },
      });
    }
  } catch (err) {
    logger.error("updateUser error:", err);
    res.status(500).json({ error: "Failed to update user", detail: String(err) });
  }
}

/**
 * Deactivate/Activate a user
 */
export async function toggleUserStatus(req, res) {
  try {
    const { type, id } = req.params;
    const { isActive } = req.body;

    if (type !== 'admin' && type !== 'employee') {
      return res.status(400).json({
        error: "Bad Request",
        detail: "Invalid user type. Must be 'admin' or 'employee'",
      });
    }

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        error: "Bad Request",
        detail: "isActive must be a boolean",
      });
    }

    const Model = type === 'admin' ? AdminUser : Employee;
    const user = await Model.findByIdAndUpdate(
      id,
      { isActive },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: "Not found", detail: `${type} not found` });
    }

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      isActive: user.isActive,
    });
  } catch (err) {
    logger.error("toggleUserStatus error:", err);
    res.status(500).json({ error: "Failed to toggle user status", detail: String(err) });
  }
}

/**
 * Reset user password (admin action)
 */
export async function resetUserPassword(req, res) {
  try {
    const { type, id } = req.params;
    const { newPassword } = req.body || {};

    if (type !== 'admin' && type !== 'employee') {
      return res.status(400).json({
        error: "Bad Request",
        detail: "Invalid user type. Must be 'admin' or 'employee'",
      });
    }

    if (!newPassword) {
      return res.status(400).json({
        error: "Bad Request",
        detail: "newPassword is required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        error: "Bad Request",
        detail: "Password must be at least 6 characters",
      });
    }

    const Model = type === 'admin' ? AdminUser : Employee;
    const user = await Model.findById(id);

    if (!user) {
      return res.status(404).json({ error: "Not found", detail: `${type} not found` });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await Model.updateOne(
      { _id: user._id },
      { $set: { passwordHash, passwordChangedAt: new Date() } }
    );

    res.json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (err) {
    logger.error("resetUserPassword error:", err);
    res.status(500).json({ error: "Failed to reset password", detail: String(err) });
  }
}

/**
 * Delete a user (hard delete - use with caution)
 */
export async function deleteUser(req, res) {
  try {
    const { type, id } = req.params;

    if (type !== 'admin' && type !== 'employee') {
      return res.status(400).json({
        error: "Bad Request",
        detail: "Invalid user type. Must be 'admin' or 'employee'",
      });
    }

    // Prevent deleting the last admin
    if (type === 'admin') {
      const adminCount = await AdminUser.countDocuments({ isActive: true });
      if (adminCount <= 1) {
        const targetAdmin = await AdminUser.findById(id);
        if (targetAdmin && targetAdmin.isActive) {
          return res.status(400).json({
            error: "Bad Request",
            detail: "Cannot delete the last active admin",
          });
        }
      }
    }

    const Model = type === 'admin' ? AdminUser : Employee;
    const user = await Model.findByIdAndDelete(id);

    if (!user) {
      return res.status(404).json({ error: "Not found", detail: `${type} not found` });
    }

    res.json({
      success: true,
      message: `${type} deleted successfully`,
    });
  } catch (err) {
    logger.error("deleteUser error:", err);
    res.status(500).json({ error: "Failed to delete user", detail: String(err) });
  }
}
