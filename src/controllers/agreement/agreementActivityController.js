import { CustomerHeaderDoc, Employee } from "#models";
import logger from "#utils/logger.js";

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function resolveRange(range, { date, from, to } = {}) {
  const now = new Date();

  switch (range) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now), label: "today" };
    case "week": {
      const start = startOfDay(now);
      start.setDate(start.getDate() - start.getDay());
      return { start, end: endOfDay(now), label: "week" };
    }
    case "month":
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
        end: endOfDay(now),
        label: "month",
      };
    case "date": {
      const fromD = from ? new Date(from) : date ? new Date(date) : now;
      const toD = to ? new Date(to) : fromD;
      if (isNaN(fromD.getTime()) || isNaN(toD.getTime())) return null;

      let start = startOfDay(fromD);
      let end = endOfDay(toD);
      if (start > end) {
        start = startOfDay(toD);
        end = endOfDay(fromD);
      }
      return { start, end, label: "date" };
    }
    default:
      return null;
  }
}

export const getAgreementActivity = async (req, res) => {
  try {
    const { range = "today", date, from, to } = req.query;
    const resolved = resolveRange(range, { date, from, to });

    if (!resolved) {
      return res.status(400).json({ success: false, error: "Invalid range or date" });
    }

    const { start, end, label } = resolved;

    const counts = await CustomerHeaderDoc.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          createdBy: { $ne: null },
          createdAt: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: "$createdBy", count: { $sum: 1 } } },
    ]);

    const usernames = counts.map((c) => c._id);
    const employees = usernames.length
      ? await Employee.find({ username: { $in: usernames } })
          .select("username fullName")
          .lean()
      : [];
    const nameByUsername = new Map(employees.map((e) => [e.username, e.fullName]));

    const result = counts.map((c) => ({
      username: c._id,
      name: nameByUsername.get(c._id) || c._id,
      count: c.count,
    }));
    result.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    const totalAgreements = counts.reduce((sum, c) => sum + c.count, 0);

    return res.json({
      success: true,
      range: label,
      start: start.toISOString(),
      end: end.toISOString(),
      totalAgreements,
      totalEmployees: result.length,
      employees: result,
    });
  } catch (error) {
    logger.error("Error fetching agreement activity:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch agreement activity" });
  }
};

export const getEmployeeAgreements = async (req, res) => {
  try {
    const { username, range = "today", date, from, to } = req.query;

    if (!username) {
      return res.status(400).json({ success: false, error: "username is required" });
    }

    const resolved = resolveRange(range, { date, from, to });
    if (!resolved) {
      return res.status(400).json({ success: false, error: "Invalid range or date" });
    }

    const { start, end } = resolved;

    const docs = await CustomerHeaderDoc.find({
      isDeleted: { $ne: true },
      createdBy: username,
      createdAt: { $gte: start, $lte: end },
    })
      .select({ "payload.headerTitle": 1, status: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .lean();

    const agreements = docs.map((doc) => ({
      id: String(doc._id),
      title: doc.payload?.headerTitle || "Untitled",
      status: doc.status || "saved",
      createdAt: doc.createdAt,
    }));

    return res.json({ success: true, username, count: agreements.length, agreements });
  } catch (error) {
    logger.error("Error fetching employee agreements:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch employee agreements" });
  }
};

export default { getAgreementActivity, getEmployeeAgreements };
