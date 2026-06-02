import bcrypt from "bcryptjs";
import { Employee } from "../../models/user/index.js";
import { signToken } from "../../middleware/authMiddleware.js";

export async function employeeLogin(req, res) {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Bad Request", detail: "username and password are required" });
    }

    const employee = await Employee.findOne({ username }).exec();
    if (!employee || !employee.isActive) {
      return res
        .status(401)
        .json({ error: "Unauthorized", detail: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, employee.passwordHash);
    if (!ok) {
      return res
        .status(401)
        .json({ error: "Unauthorized", detail: "Invalid credentials" });
    }

    const token = signToken(employee, 'employee');

    employee.lastLoginAt = new Date();
    await employee.save();

    res.json({
      token,
      user: {
        id: employee._id,
        username: employee.username,
        fullName: employee.fullName,
        email: employee.email,
        isActive: employee.isActive,
        lastLoginAt: employee.lastLoginAt,
      },
      role: 'employee',
    });
  } catch (err) {
    console.error("employeeLogin error:", err);
    res.status(500).json({ error: "Login failed", detail: String(err) });
  }
}

export async function getEmployeeProfile(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res
        .status(401)
        .json({ error: "Unauthorized", detail: "Missing user from token" });
    }

    const employee = await Employee.findById(userId)
      .select("_id username fullName email isActive lastLoginAt createdAt updatedAt")
      .lean();

    if (!employee) {
      return res
        .status(404)
        .json({ error: "Not found", detail: "Employee not found" });
    }

    res.json({
      user: {
        id: employee._id,
        username: employee.username,
        fullName: employee.fullName,
        email: employee.email,
        isActive: employee.isActive,
        lastLoginAt: employee.lastLoginAt,
      },
      role: 'employee',
    });
  } catch (err) {
    console.error("getEmployeeProfile error:", err);
    res
      .status(500)
      .json({ error: "Failed to fetch employee profile", detail: String(err) });
  }
}

export async function changeEmployeePassword(req, res) {
  try {
    const { oldPassword, newPassword } = req.body || {};

    if (!oldPassword || !newPassword) {
      return res
        .status(400)
        .json({ error: "Bad Request", detail: "oldPassword and newPassword are required" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: "Bad Request", detail: "New password must be at least 6 characters" });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res
        .status(401)
        .json({ error: "Unauthorized", detail: "Missing user from token" });
    }

    const employee = await Employee.findById(userId).exec();
    if (!employee) {
      return res
        .status(404)
        .json({ error: "Not found", detail: "Employee not found" });
    }

    const ok = await bcrypt.compare(oldPassword, employee.passwordHash);
    if (!ok) {
      return res
        .status(401)
        .json({ error: "Unauthorized", detail: "Old password is incorrect" });
    }

    employee.passwordHash = await bcrypt.hash(newPassword, 10);
    employee.passwordChangedAt = new Date();
    await employee.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    console.error("changeEmployeePassword error:", err);
    res
      .status(500)
      .json({ error: "Password change failed", detail: String(err) });
  }
}
