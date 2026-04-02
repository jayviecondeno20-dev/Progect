const mysql = require('mysql2');

const dbConfig = {
<<<<<<< HEAD
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'myDB_Project'
=======
  host: process.env.DB_HOST || 'bnivdbauhfdml9iyewd2-mysql.services.clever-cloud.com',
  user: process.env.DB_USER || 'uaupgzxcgsrwjfo4',
  password: process.env.DB_PASSWORD || '58QdXykEx4EnQGXHWOm9',
  database: process.env.DB_NAME || 'bnivdbauhfdml9iyewd2',
  port: process.env.DB_PORT || 3306
>>>>>>> 8fabaa3241f2567db97b97048f535da3290f1eb0
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
