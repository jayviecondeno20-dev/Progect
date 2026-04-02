const mysql = require('mysql2');

const dbConfig = {
  host: process.env.DB_HOST || 'bnivdbauhfdml9iyewd2-mysql.services.clever-cloud.com',
  user: process.env.DB_USER || 'uaupgzxcgsrwjfo4',
  password: process.env.DB_PASSWORD || '58QdXykEx4EnQGXHWOm9',
  database: process.env.DB_NAME || 'bnivdbauhfdml9iyewd2',
  port: process.env.DB_PORT || 3306,
  connectionLimit: 3, // Safe limit for Clever Cloud free tier (max 5)
  waitForConnections: true,
  queueLimit: 0
};


const pool = mysql.createPool(dbConfig);

const dbQuery = (query, values) => {
    return new Promise((resolve, reject) => {
        pool.query(query, values, (err, result) => {
            if (err) return reject(err);
            resolve(result);
        });
    });
};

dbQuery.pool = pool; // I-export ang pool para magamit sa session store

// Simpler query wrapper using pool.query (automatically handles connection release)
module.exports = dbQuery;
