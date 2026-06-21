import "dotenv/config";
import logger from "../utils/logger.js";

if (process.env.NODE_ENV === "production") {
  console.log = (...args) => logger.debug(...args);
  console.info = (...args) => logger.info(...args);
  console.debug = (...args) => logger.debug(...args);
  console.warn = (...args) => logger.warn(...args);
  console.error = (...args) => logger.error(...args);
}

export default logger;
