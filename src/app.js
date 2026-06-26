import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from "compression";
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { PDF_MAX_BODY_MB } from "./config/pdfConfig.js";
import logger from "./utils/logger.js";

// Agreement Domain Routes
import pdfRoutes from "./routes/agreement/pdfRoutes.js";
import manualUploadRoutes from './routes/agreement/manualUploadRoutes.js';
import versionRoutes from './routes/agreement/versionRoutes.js';
import emailRoutes from './routes/agreement/emailRoutes.js';
import versionLogRoutes from './routes/agreement/versionLogs.js';
import agreementActivityRoutes from './routes/agreement/agreementActivityRoutes.js';

// Admin Domain Routes
import adminAuthRoutes from "./routes/admin/adminAuthRoutes.js";
import pricingBackupRoutes from './routes/admin/pricingBackupRoutes.js';
import adminSettingsRoutes from './routes/admin/adminSettingsRoutes.js';
import payrollRoutes from './routes/admin/payrollRoutes.js';

// Product Domain Routes
import priceFixRoutes from "./routes/product/priceFixRoutes.js";
import productCatalogRoutes from './routes/product/productCatalogRoutes.js';
import accountTypeRoutes from './routes/product/accountTypeRoutes.js';

// Commission Domain Routes
import commissionRoutes from './routes/commission/commissionRoutes.js';
import quotaRoutes from './routes/commission/quotaRoutes.js';

// Sync Domain Routes
import routestarCustomersRoutes from './routes/sync/routestarCustomersRoutes.js';
import biginAuditRoutes from './routes/sync/biginAuditRoutes.js';
import mapDistanceRoutes from './routes/sync/mapDistanceRoutes.js';
import zohoUploadRoutes from './routes/sync/zohoUploadRoutes.js';

// User Domain Routes
import employeeAuthRoutes from "./routes/user/employeeAuthRoutes.js";
import userManagementRoutes from "./routes/user/userManagementRoutes.js";

// Service Domain Routes
import serviceConfigRoutes from './routes/service/serviceConfigRoutes.js';
import emailTemplateRoutes from './routes/service/emailTemplateRoutes.js';
import serviceAgreementTemplateRoutes from './routes/service/serviceAgreementTemplateRoutes.js';

// Customer Domain Routes
import biginCompanyRoutes from './routes/customer/biginCompanyRoutes.js';
import companyMappingRoutes from './routes/customer/companyMappingRoutes.js';

// Proposal Domain Routes
import proposalRoutes from './routes/proposal/proposalRoutes.js';

// Auth Domain Routes
import oauthRoutes from './routes/auth/oauthRoutes.js';


const app = express();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../../uploads/service-images');
fs.mkdirSync(uploadsDir, { recursive: true });

app.use('/uploads', express.static(path.join(__dirname, '../../uploads'), {
  maxAge: process.env.UPLOADS_CACHE_MAX_AGE || '1d',
  etag: true,
  lastModified: true,
}));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'http://localhost:5173'];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (process.env.NODE_ENV === 'production') {
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy: Origin ${origin} is not allowed`));
      }
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  exposedHeaders: ['X-CustomerHeaderDoc-Id', 'X-AdminHeaderDoc-Id', 'Content-Disposition']
};

app.use(cors(corsOptions));
app.use(compression({ threshold: 1024 }));

if (process.env.NODE_ENV === 'production') {
  app.use(
    morgan('combined', {
      stream: logger.stream,
      skip: (req) => req.path === '/health',
    })
  );
} else {
  app.use(morgan('dev'));
}

app.use(express.json({ limit: `${PDF_MAX_BODY_MB}mb` }));

app.get('/health', async (req, res) => {
  const healthCheck = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    service: 'enviro-backend',
    version: process.env.npm_package_version || '1.0.0'
  };

  try {
    const mongoose = await import('mongoose');
    if (mongoose.default.connection.readyState === 1) {
      healthCheck.database = {
        status: 'connected',
        name: mongoose.default.connection.name
      };
    } else {
      healthCheck.database = {
        status: 'disconnected',
        message: 'Database connection not ready'
      };
      healthCheck.status = 'degraded';
    }
  } catch (error) {
    healthCheck.database = {
      status: 'error',
      message: error.message
    };
    healthCheck.status = 'degraded';
  }

  const memUsage = process.memoryUsage();
  healthCheck.memory = {
    rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
  };

  healthCheck.cpu = {
    usage: process.cpuUsage()
  };

  healthCheck.responseTime = `${Date.now() - req._startTime}ms`;

  const httpStatus = healthCheck.status === 'ok' ? 200 : 503;

  res.status(httpStatus).json(healthCheck);
});

app.use((req, _res, next) => {
  req._startTime = Date.now();
  next();
});


app.use('/api/proposals', proposalRoutes);
app.use("/api/pdf",       pdfRoutes);
app.use("/api/admin", adminAuthRoutes);
app.use("/api/employee", employeeAuthRoutes);
app.use("/api/users", userManagementRoutes);
app.use("/api/pricefix", priceFixRoutes);
app.use("/api/product-catalog", productCatalogRoutes);
app.use("/api/service-configs", serviceConfigRoutes);
app.use("/api/manual-upload", manualUploadRoutes);
app.use("/oauth", oauthRoutes);
app.use("/api/zoho-upload", zohoUploadRoutes);
app.use("/api/versions", versionRoutes);
app.use("/api/pricing-backup", pricingBackupRoutes);
app.use("/api/pdf/version-logs", versionLogRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/email-template", emailTemplateRoutes);
app.use("/api/service-agreement-template", serviceAgreementTemplateRoutes);
app.use("/api/admin-settings", adminSettingsRoutes);
app.use("/api/commission", commissionRoutes);
app.use("/api/account-type", accountTypeRoutes);
app.use("/api/quota", quotaRoutes);
app.use("/api/routestar-customers", routestarCustomersRoutes);
app.use("/api/bigin-audit", biginAuditRoutes);
app.use("/api/bigin-companies", biginCompanyRoutes);
app.use("/api/company-mappings", companyMappingRoutes);
app.use("/api/map-distance", mapDistanceRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/agreement-activity", agreementActivityRoutes);

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

app.use((err, req, res, next) => {
  logger.error("Unhandled request error:", err);
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    ok: false,
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message || "Internal server error",
  });
});

export default app;
