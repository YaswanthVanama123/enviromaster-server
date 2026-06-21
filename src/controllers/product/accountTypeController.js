import logger from "../../utils/logger.js";
/**
 * Account Type Detection Controller
 * Auto-detects account type based on revenue and distance to nearest anchor
 *
 * Account Type Rules:
 * - Anchor: Revenue ≥ $200/visit (or ≥ $100 if Greenline)
 * - Bread5: Revenue < $200 AND within 5 minutes of nearest Anchor
 * - Bread15: Revenue < $200 AND 5-15 minutes from nearest Anchor
 * - Pit: Revenue < $200 AND > 15 minutes from nearest Anchor (or no Anchor found)
 */

// Thresholds for account type detection
const THRESHOLDS = {
  anchorMinRevenue: 200,          // Standard anchor threshold
  anchorMinRevenueGreenline: 100, // Greenline anchor threshold
  bread5MaxMinutes: 5,            // Max driving time for Bread5
  bread15MaxMinutes: 15,          // Max driving time for Bread15
  milesPerMinute: 0.5,            // Approximate: 30mph = 0.5 miles per minute
};

/**
 * Estimate driving time from distance in miles
 * Using 30mph average speed
 */
function estimateDrivingTime(distanceMiles) {
  return distanceMiles / THRESHOLDS.milesPerMinute;
}

/**
 * Detect account type based on revenue and distance
 */
function detectAccountType(perVisitRevenue, distanceToAnchorMiles, isGreenline = false) {
  // Determine anchor threshold based on pricing line
  const anchorThreshold = isGreenline
    ? THRESHOLDS.anchorMinRevenueGreenline
    : THRESHOLDS.anchorMinRevenue;

  // Check if this location qualifies as Anchor
  if (perVisitRevenue >= anchorThreshold) {
    return {
      accountType: 'Anchor',
      confidence: 'high',
      reason: `Revenue $${perVisitRevenue} meets ${isGreenline ? 'Greenline' : 'standard'} Anchor threshold of $${anchorThreshold}`,
      drivingTimeMinutes: null,
      distanceMiles: null,
    };
  }

  // For non-Anchor locations, use distance to nearest Anchor
  if (distanceToAnchorMiles === null || distanceToAnchorMiles === undefined) {
    return {
      accountType: 'Pit',
      confidence: 'low',
      reason: 'No distance data available - defaulting to Pit',
      drivingTimeMinutes: null,
      distanceMiles: null,
    };
  }

  const drivingTimeMinutes = estimateDrivingTime(distanceToAnchorMiles);

  if (drivingTimeMinutes < THRESHOLDS.bread5MaxMinutes) {
    return {
      accountType: 'Bread5',
      confidence: 'high',
      reason: `Within ${drivingTimeMinutes.toFixed(1)} minutes of nearest Anchor (< ${THRESHOLDS.bread5MaxMinutes} min threshold)`,
      drivingTimeMinutes,
      distanceMiles: distanceToAnchorMiles,
    };
  }

  if (drivingTimeMinutes <= THRESHOLDS.bread15MaxMinutes) {
    return {
      accountType: 'Bread15',
      confidence: 'high',
      reason: `${drivingTimeMinutes.toFixed(1)} minutes from nearest Anchor (${THRESHOLDS.bread5MaxMinutes}-${THRESHOLDS.bread15MaxMinutes} min range)`,
      drivingTimeMinutes,
      distanceMiles: distanceToAnchorMiles,
    };
  }

  return {
    accountType: 'Pit',
    confidence: 'high',
    reason: `${drivingTimeMinutes.toFixed(1)} minutes from nearest Anchor (> ${THRESHOLDS.bread15MaxMinutes} min threshold)`,
    drivingTimeMinutes,
    distanceMiles: distanceToAnchorMiles,
  };
}

/**
 * Detect account type endpoint
 * POST /api/account-type/detect
 */
export async function detect(req, res) {
  try {
    const { perVisitRevenue, distanceToAnchorMiles, isGreenline } = req.body;

    // Validate required fields
    if (perVisitRevenue === undefined || perVisitRevenue === null) {
      return res.status(400).json({ error: 'perVisitRevenue is required' });
    }

    if (perVisitRevenue < 0) {
      return res.status(400).json({ error: 'perVisitRevenue must be non-negative' });
    }

    const result = detectAccountType(
      parseFloat(perVisitRevenue),
      distanceToAnchorMiles !== undefined ? parseFloat(distanceToAnchorMiles) : null,
      Boolean(isGreenline)
    );

    res.json({
      success: true,
      input: {
        perVisitRevenue,
        distanceToAnchorMiles,
        isGreenline: Boolean(isGreenline),
      },
      result,
      thresholds: THRESHOLDS,
    });
  } catch (error) {
    logger.error('Error detecting account type:', error);
    res.status(500).json({ error: 'Failed to detect account type' });
  }
}

/**
 * Batch detect account types for multiple locations
 * POST /api/account-type/detect-batch
 */
export async function detectBatch(req, res) {
  try {
    const { locations } = req.body;

    if (!Array.isArray(locations)) {
      return res.status(400).json({ error: 'locations must be an array' });
    }

    const results = locations.map((location, index) => {
      const { perVisitRevenue, distanceToAnchorMiles, isGreenline, customerId, customerName } = location;

      if (perVisitRevenue === undefined || perVisitRevenue === null) {
        return {
          index,
          customerId,
          customerName,
          error: 'perVisitRevenue is required',
        };
      }

      const result = detectAccountType(
        parseFloat(perVisitRevenue),
        distanceToAnchorMiles !== undefined ? parseFloat(distanceToAnchorMiles) : null,
        Boolean(isGreenline)
      );

      return {
        index,
        customerId,
        customerName,
        input: {
          perVisitRevenue,
          distanceToAnchorMiles,
          isGreenline: Boolean(isGreenline),
        },
        result,
      };
    });

    res.json({
      success: true,
      total: locations.length,
      results,
      thresholds: THRESHOLDS,
    });
  } catch (error) {
    logger.error('Error batch detecting account types:', error);
    res.status(500).json({ error: 'Failed to batch detect account types' });
  }
}

/**
 * Get account type thresholds
 * GET /api/account-type/thresholds
 */
export async function getThresholds(req, res) {
  try {
    res.json({
      success: true,
      thresholds: THRESHOLDS,
      accountTypes: [
        {
          type: 'Anchor',
          description: 'High-revenue location',
          criteria: `Revenue ≥ $${THRESHOLDS.anchorMinRevenue} (or ≥ $${THRESHOLDS.anchorMinRevenueGreenline} if Greenline)`,
          deduction: 0,
        },
        {
          type: 'Bread5',
          description: 'Within 5 minutes of Anchor',
          criteria: `Revenue < $${THRESHOLDS.anchorMinRevenue} AND < ${THRESHOLDS.bread5MaxMinutes} min drive to nearest Anchor`,
          deduction: 50,
        },
        {
          type: 'Bread15',
          description: 'Within 15 minutes of Anchor',
          criteria: `Revenue < $${THRESHOLDS.anchorMinRevenue} AND ${THRESHOLDS.bread5MaxMinutes}-${THRESHOLDS.bread15MaxMinutes} min drive to nearest Anchor`,
          deduction: 75,
        },
        {
          type: 'Pit',
          description: 'New location, far from Anchor',
          criteria: `Revenue < $${THRESHOLDS.anchorMinRevenue} AND > ${THRESHOLDS.bread15MaxMinutes} min drive to nearest Anchor`,
          deduction: 100,
        },
      ],
    });
  } catch (error) {
    logger.error('Error getting thresholds:', error);
    res.status(500).json({ error: 'Failed to get thresholds' });
  }
}

export default {
  detect,
  detectBatch,
  getThresholds,
};
