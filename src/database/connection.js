const mysql = require('mysql2');

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'myDB_Project'
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