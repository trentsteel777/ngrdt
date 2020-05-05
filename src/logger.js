const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;
require('winston-daily-rotate-file')

const myFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} ${level}: ${message}`; // Add back in if you want to name the logger: [${label}]
});

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.label({ label: 'def' }),
    format.timestamp(),
    myFormat
  ),
  //defaultMeta: { service: 'your-service-name' },
  transports: [
    // - Write to all logs with level `info` and below to `quick-start-combined.log`.
    // - Write all logs error (and below) to `quick-start-error.log`.
    new (transports.DailyRotateFile)({
      level: 'error',
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      utc: true,
      dirname: 'logs',
      zippedArchive: false,
      maxSize: '20m',
      maxFiles: '7d'
    }),
    new (transports.DailyRotateFile)({
      level: 'info',
      filename: 'application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      utc: true,
      dirname: 'logs',
      zippedArchive: false,
      maxSize: '20m',
      maxFiles: '7d'
    }),
  ]
});

// If we're not in production then **ALSO** log to the `console`
// with the colorized simple format.
// Make sure ENV Variable is set in PROD: vi ~/.bash_profile, then insert NODE_ENV=production
if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({
    format: format.combine(
      format.colorize(),
      format.simple(),
      myFormat
    )
  }));
}

exports.logger = logger