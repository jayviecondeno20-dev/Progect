const connection = require('../database/connection');
const db = require('../database/connection')

module.exports = async (id,username, password, confirm_password, category)=>{
    try{
        const query = `UPDATE accounts SET username = '${username}', password = '${password}', confirm_password = '${confirm_password}', category = '${category}' WHERE id = ${id}`;
        
        await connection(query)
        return true

    }catch(err){
        return false
    }
}