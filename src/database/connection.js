const mysql = require('mysql2');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'myDB_Project'
};

const pool = mysql.createPool(dbConfig);

module.exports = (query, values) => {
    return new Promise((resolve, reject) => {
        pool.getConnection((err, sql) => {
            if (err) return reject(err);
            sql.query(query, values, (err, result) => {
                sql.release();
                if (err) return reject(err);
                resolve(result); // Dito kinukuha ang data records
            });
        });
    });
};