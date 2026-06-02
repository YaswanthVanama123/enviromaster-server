import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { signAdminToken } from "../../middleware/adminAuth.js";
import { AdminUser } from "../../models/user/index.js";
import { CustomerHeaderDoc, ManualUploadDocument, VersionPdf } from "../../models/agreement/index.js";

export async function adminLogin(req, res) {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Bad Request", detail: "username and password are required" });
    }

    const admin = await AdminUser.findOne({ username }).exec();
    if (!admin || !admin.isActive) {
      return res
        .status(401)
        .json({ error: "Unauthorized", detail: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      return res
        .status(401)
        .json({ error: "Unauthorized", detail: "Invalid credentials" });
    }

    const token = signAdminToken(admin);

    admin.lastLoginAt = new Date();
    await admin.save();

    res.json({
      token,
      admin: {
        id: admin._id,
        username: admin.username,
      },
    });
  } catch (err) {
    console.error("adminLogin error:", err);
    res.status(500).json({ error: "Login failed", detail: String(err) });
  }
}

export async function changeAdminPassword(req, res) {
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

    const adminId = req.admin?.id;
    if (!adminId) {
      return res
        .status(401)
        .json({ error: "Unauthorized", detail: "Missing admin from token" });
    }

    const admin = await AdminUser.findById(adminId).exec();
    if (!admin) {
      return res
        .status(404)
        .json({ error: "Not found", detail: "Admin user not found" });
    }

    const ok = await bcrypt.compare(oldPassword, admin.passwordHash);
    if (!ok) {
      return res
        .status(401)
        .json({ error: "Unauthorized", detail: "Old password is incorrect" });
    }

    admin.passwordHash = await bcrypt.hash(newPassword, 10);
    admin.passwordChangedAt = new Date();
    await admin.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    console.error("changeAdminPassword error:", err);
    res
      .status(500)
      .json({ error: "Password change failed", detail: String(err) });
  }
}

export async function getAdminProfile(req, res) {
  try {
    const adminId = req.admin?.id;
    if (!adminId) {
      return res
        .status(401)
        .json({ error: "Unauthorized", detail: "Missing admin from token" });
    }

    const admin = await AdminUser.findById(adminId)
      .select("_id username isActive lastLoginAt createdAt updatedAt")
      .lean();

    if (!admin) {
      return res
        .status(404)
        .json({ error: "Not found", detail: "Admin user not found" });
    }

    res.json({ admin });
  } catch (err) {
    console.error("getAdminProfile error:", err);
    res
      .status(500)
      .json({ error: "Failed to fetch admin profile", detail: String(err) });
  }
}

export async function createAdminAccount(req, res) {
  try {
    const { username, password, isActive } = req.body || {};

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Bad Request", detail: "username and password are required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Bad Request", detail: "Password must be at least 6 characters" });
    }

    const existing = await AdminUser.findOne({ username }).lean();
    if (existing) {
      return res
        .status(409)
        .json({ error: "Conflict", detail: "Username already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const admin = await AdminUser.create({
      username,
      passwordHash,
      isActive: typeof isActive === "boolean" ? isActive : true,
    });

    res.status(201).json({
      success: true,
      admin: {
        id: admin._id,
        username: admin.username,
        isActive: admin.isActive,
        createdAt: admin.createdAt,
      },
    });
  } catch (err) {
    console.error("createAdminAccount error:", err);
    res
      .status(500)
      .json({ error: "Create admin failed", detail: String(err) });
  }
}

export async function getAdminDashboard(req, res) {
  try {
    const startTime = Date.now();
    console.log('📊 [ADMIN-DASHBOARD] Starting optimized dashboard data fetch...');

    if (mongoose.connection.readyState !== 1) {
      console.log('⚠️ [ADMIN-DASHBOARD] Database not connected, connection state:', mongoose.connection.readyState);
      return res.json({
        stats: {
          manualUploads: 0,
          savedDocuments: 0,
          totalDocuments: 0
        },
        documentStatus: {
          done: 0,
          pending: 0,
          saved: 0,
          drafts: 0
        },
        _debug: {
          databaseState: 'disconnected',
          connectionReadyState: mongoose.connection.readyState
        }
      });
    }

    const aggregationStartTime = Date.now();

    const [customerHeaderStats, manualUploadsCount] = await Promise.all([
      CustomerHeaderDoc.aggregate([
        { $match: { isDeleted: { $ne: true } } },

        {
          $facet: {
            totalCount: [{ $count: 'count' }],

            savedCount: [
              {
                $match: {
                  $or: [
                    { 'pdf_meta.pdfBuffer': { $exists: true, $ne: null } },
                    { 'zoho.bigin.fileId': { $exists: true, $ne: null } },
                    { 'zoho.crm.fileId': { $exists: true, $ne: null } }
                  ]
                }
              },
              { $count: 'count' }
            ],

            draftCount: [
              { $match: { status: 'draft' } },
              { $count: 'count' }
            ],

            savedStatusCount: [
              { $match: { status: 'saved' } },
              { $count: 'count' }
            ],

            pendingCount: [
              {
                $match: {
                  $or: [
                    { status: 'pending_approval' },
                    { status: 'approved_salesman' }
                  ]
                }
              },
              { $count: 'count' }
            ],

            approvedCount: [
              { $match: { status: 'approved_admin' } },
              { $count: 'count' }
            ]
          }
        }
      ]),

      ManualUploadDocument.countDocuments({ isDeleted: { $ne: true } })
    ]);

    const aggregationTime = Date.now() - aggregationStartTime;

    const stats = customerHeaderStats[0];
    const totalDocumentsCount = stats.totalCount[0]?.count || 0;
    const savedDocumentsCount = stats.savedCount[0]?.count || 0;
    const draftCount = stats.draftCount[0]?.count || 0;
    const savedCount = stats.savedStatusCount[0]?.count || 0;
    const pendingCount = stats.pendingCount[0]?.count || 0;
    const approvedCount = stats.approvedCount[0]?.count || 0;

    const totalTime = Date.now() - startTime;
    console.log(`⚡ [OPTIMIZED SUMMARY] Total: ${totalTime}ms | Aggregation: ${aggregationTime}ms`);
    console.log('📊 [COUNTS] Manual uploads:', manualUploadsCount);
    console.log('📊 [COUNTS] Total documents:', totalDocumentsCount);
    console.log('📊 [COUNTS] Saved documents:', savedDocumentsCount);
    console.log('📊 [COUNTS] By status - Draft:', draftCount, 'Saved:', savedCount, 'Pending:', pendingCount, 'Approved:', approvedCount);

    const dashboardData = {
      stats: {
        manualUploads: manualUploadsCount,
        savedDocuments: savedDocumentsCount,
        totalDocuments: totalDocumentsCount
      },
      documentStatus: {
        done: approvedCount,
        pending: pendingCount,
        saved: savedCount,
        drafts: draftCount
      },
      _metadata: {
        performance: {
          totalTime: `${totalTime}ms`,
          aggregationTime: `${aggregationTime}ms`
        },
        optimized: true,
        queryType: 'single_aggregation_with_facet',
        note: 'recentDocuments removed - fetched separately via /api/pdf/saved-files/grouped'
      },
      _debug: {
        databaseState: 'connected',
        connectionReadyState: mongoose.connection.readyState,
        queryResults: {
          manualUploadsCount,
          savedDocumentsCount,
          totalDocumentsCount,
          draftCount,
          savedCount,
          pendingCount,
          approvedCount
        }
      }
    };

    console.log('✅ [ADMIN-DASHBOARD] Successfully fetched dashboard data:', {
      manualUploads: manualUploadsCount,
      savedDocuments: savedDocumentsCount,
      totalDocuments: totalDocumentsCount,
      performanceMs: totalTime
    });

    res.json(dashboardData);

  } catch (err) {
    console.error('❌ [ADMIN-DASHBOARD] Error fetching dashboard data:', err);
    console.error('❌ [ADMIN-DASHBOARD] Error stack:', err.stack);

    res.status(500).json({
      error: "Failed to fetch dashboard data",
      detail: String(err),
      stats: {
        manualUploads: 0,
        savedDocuments: 0,
        totalDocuments: 0
      },
      documentStatus: {
        done: 0,
        pending: 0,
        saved: 0,
        drafts: 0
      },
      _debug: {
        databaseState: 'error',
        connectionReadyState: mongoose.connection.readyState,
        errorMessage: err.message
      }
    });
  }
}

export async function getAdminRecentDocuments(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "20", 10), 1),
      100
    );

    console.log('📄 [ADMIN-RECENT] Fetching recent documents - page:', page, 'limit:', limit);
    console.log('📄 [DB-STATE] Connection state:', mongoose.connection.readyState);

    if (mongoose.connection.readyState !== 1) {
      console.log('⚠️ [ADMIN-RECENT] Database not connected, connection state:', mongoose.connection.readyState);
      return res.json({
        total: 0,
        page,
        limit,
        documents: [],
        _debug: {
          databaseState: 'disconnected',
          connectionReadyState: mongoose.connection.readyState
        }
      });
    }

    const filter = {
      $or: [
        { isDeleted: { $exists: false } },
        { isDeleted: false },
        { isDeleted: { $ne: true } }
      ]
    };

    if (req.query.status) {
      filter.status = req.query.status;
      console.log('📄 [ADMIN-RECENT] Filtering by status:', req.query.status);
    }

    console.log('📄 [QUERY] Counting total documents...');
    const total = await CustomerHeaderDoc.countDocuments(filter);
    console.log('📄 [COUNT] Total matching documents:', total);

    console.log('📄 [QUERY] Fetching recent documents...');
    const documents = await CustomerHeaderDoc.find(filter)
      .select({
        _id: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
        'payload.headerTitle': 1,
        'pdf_meta.sizeBytes': 1,
        'pdf_meta.storedAt': 1,
        'pdf_meta.pdfBuffer': 1,
        'zoho.bigin.dealId': 1,
        'zoho.bigin.fileId': 1,
        'zoho.crm.dealId': 1,
        'zoho.crm.fileId': 1,
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    console.log('📄 [RESULT] Found documents for this page:', documents.length);

    const transformedDocuments = documents.map(doc => {
      try {
        return {
          id: doc._id,
          title: doc.payload?.headerTitle || 'Untitled Document',
          status: doc.status || 'saved',
          createdDate: doc.createdAt,
          uploadedOn: doc.pdf_meta?.storedAt || doc.createdAt,
          hasPdf: !!(
            doc.pdf_meta?.pdfBuffer ||
            (doc.zoho?.bigin?.fileId && !doc.zoho.bigin.fileId.includes('MOCK_')) ||
            (doc.zoho?.crm?.fileId && !doc.zoho.crm.fileId.includes('MOCK_'))
          ),
          fileSize: doc.pdf_meta?.sizeBytes || 0,
          createdDateFormatted: new Date(doc.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          }),
          uploadedOnFormatted: new Date(doc.pdf_meta?.storedAt || doc.createdAt).toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric'
          })
        };
      } catch (transformError) {
        console.warn('⚠️ [ADMIN-RECENT] Error transforming document:', doc._id, transformError);
        return {
          id: doc._id,
          title: 'Error loading document',
          status: 'error',
          createdDate: doc.createdAt,
          uploadedOn: doc.createdAt,
          hasPdf: false,
          fileSize: 0,
          createdDateFormatted: 'Error',
          uploadedOnFormatted: 'Error'
        };
      }
    });

    console.log('✅ [ADMIN-RECENT] Successfully fetched recent documents:', {
      total,
      page,
      limit,
      documentsCount: transformedDocuments.length
    });

    res.json({
      total,
      page,
      limit,
      documents: transformedDocuments,
      _debug: {
        databaseState: 'connected',
        connectionReadyState: mongoose.connection.readyState,
        filter: JSON.stringify(filter),
        queryResults: {
          total,
          returnedCount: transformedDocuments.length
        }
      }
    });

  } catch (err) {
    console.error('❌ [ADMIN-RECENT] Error fetching recent documents:', err);
    console.error('❌ [ADMIN-RECENT] Error stack:', err.stack);

    res.status(500).json({
      error: "Failed to fetch recent documents",
      detail: String(err),
      total: 0,
      page: parseInt(req.query.page || "1", 10),
      limit: parseInt(req.query.limit || "20", 10),
      documents: [],
      _debug: {
        databaseState: 'error',
        connectionReadyState: mongoose.connection.readyState,
        errorMessage: err.message
      }
    });
  }
}

function parseDateParam(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getTimeRange(period, from, to) {
  const now = new Date();
  let startDate = null;
  let endDate = null;

  switch (period) {
    case "this_week": {
      startDate = new Date(now);
      const day = startDate.getDay();
      startDate.setDate(now.getDate() - day);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case "this_year": {
      startDate = new Date(now.getFullYear(), 0, 1);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case "date_range": {
      startDate = from ? new Date(from) : null;
      endDate = to ? new Date(to) : null;
      break;
    }
    case "this_month":
    default: {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
  }

  if (endDate) {
    endDate.setHours(23, 59, 59, 999);
  }

  if (startDate && !endDate) {
    endDate = new Date();
  }

  if (!startDate) {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    startDate.setHours(0, 0, 0, 0);
  }

  return { startDate, endDate };
}

export async function getAdminDashboardStatusCounts(req, res) {
  try {
    const requestedPeriod = String(req.query.period || "this_month").toLowerCase();
    const fromDate = parseDateParam(req.query.from);
    const toDate = parseDateParam(req.query.to);

    const { startDate, endDate } = getTimeRange(requestedPeriod, fromDate, toDate);

    const softDeleteFilter = {
      $or: [
        { isDeleted: { $exists: false } },
        { isDeleted: false },
        { isDeleted: { $ne: true } }
      ]
    };

    const timeFilter = {};
    if (startDate || endDate) {
      timeFilter.updatedAt = {};
      if (startDate) {
        timeFilter.updatedAt.$gte = startDate;
      }
      if (endDate) {
        timeFilter.updatedAt.$lte = endDate;
      }
    }

    const filter = {
      ...softDeleteFilter,
      ...timeFilter
    };

    const [doneCount, pendingCount, savedCount, draftCount] = await Promise.all([
      CustomerHeaderDoc.countDocuments({
        ...filter,
        status: "approved_admin"
      }),
      CustomerHeaderDoc.countDocuments({
        ...filter,
        status: { $in: ["pending_approval", "approved_salesman"] }
      }),
      CustomerHeaderDoc.countDocuments({
        ...filter,
        status: "saved"
      }),
      CustomerHeaderDoc.countDocuments({
        ...filter,
        status: "draft"
      })
    ]);

    const total = doneCount + pendingCount + savedCount + draftCount;

    res.json({
      success: true,
      period: requestedPeriod,
      counts: {
        done: doneCount,
        pending: pendingCount,
        saved: savedCount,
        drafts: draftCount,
        total
      },
      startDate: startDate?.toISOString() || null,
      endDate: endDate?.toISOString() || null
    });
  } catch (err) {
    console.error("getAdminDashboardStatusCounts error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch status counts",
      detail: err?.message || String(err)
    });
  }
}

export async function resetAdminPassword(req, res) {
  try {
    const { developerName, newPassword } = req.body || {};

    if (!developerName || !newPassword) {
      return res
        .status(400)
        .json({
          error: "Bad Request",
          message: "Developer name and new password are required"
        });
    }

    if (developerName.trim().toLowerCase() !== "hanitha") {
      return res
        .status(403)
        .json({
          error: "Forbidden",
          message: "Only authorized developers can reset passwords"
        });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({
          error: "Bad Request",
          message: "Password must be at least 6 characters long"
        });
    }

    const admin = await AdminUser.findOne({ username: "envimaster" }).exec();

    if (!admin) {
      return res
        .status(404)
        .json({
          error: "Not Found",
          message: "Admin user not found"
        });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    admin.passwordHash = passwordHash;
    admin.passwordChangedAt = new Date();
    await admin.save();

    console.log(`[ADMIN-AUTH] Password reset by developer: ${developerName}`);

    res.json({
      success: true,
      message: "Password reset successfully"
    });

  } catch (err) {
    console.error("resetAdminPassword error:", err);
    res
      .status(500)
      .json({
        error: "Password reset failed",
        message: "An error occurred while resetting the password",
        detail: String(err)
      });
  }
}
