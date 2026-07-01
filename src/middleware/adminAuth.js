import jwt from "jsonwebtoken";
import { AdminUser } from "#models";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const SUPER_ADMIN_USERNAME = "envimaster";

export function signAdminToken(admin) {
  const payload = {
    id: admin._id.toString(),
    username: admin.username,
    role: 'admin',
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function requireAdminAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  // Accept the token from the Authorization header OR a `?token=` query param.
  // Browser navigation / RN Linking (e.g. PDF export downloads opened by URL)
  // cannot set request headers, so they pass the JWT as a query parameter.
  const token = auth.startsWith("Bearer ")
    ? auth.slice(7)
    : (typeof req.query?.token === "string" && req.query.token) || null;

  if (!token) {
    return res
      .status(401)
      .json({ error: "Unauthorized", detail: "Missing Authorization token" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = { id: decoded.id, username: decoded.username };
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ error: "Unauthorized", detail: "Invalid or expired token" });
  }
}

export async function requireBackupPermission(req, res, next) {
  return permissionGuard("backupManagement", "manage backups")(req, res, next);
}

export async function requirePriceChangePermission(req, res, next) {
  return permissionGuard("priceChanges", "change pricing")(req, res, next);
}

function permissionGuard(permKey, label) {
  return async (req, res, next) => {
    try {
      if (!req.admin?.id) {
        return res
          .status(401)
          .json({ error: "Unauthorized", detail: "Admin authentication required" });
      }

      const admin = await AdminUser.findById(req.admin.id)
        .select("username permissions")
        .lean();

      if (!admin) {
        return res.status(401).json({ error: "Unauthorized", detail: "Admin not found" });
      }

      const allowed =
        admin.username === SUPER_ADMIN_USERNAME || admin.permissions?.[permKey] === true;

      if (!allowed) {
        return res.status(403).json({
          error: "Forbidden",
          detail: `You do not have permission to ${label}`,
        });
      }

      next();
    } catch (err) {
      return res.status(500).json({ error: "Permission check failed" });
    }
  };
}

export function priceChangeWriteGuard(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  return requireAdminAuth(req, res, () => requirePriceChangePermission(req, res, next));
}
