const express = require('express');
const router = express.Router();

const createService = require('../services/create');
const retreiveService = require('../services/retreive');
const updateService = require('../services/update');
const deleteService = require('../services/delete');


router.post('/create', async(req, res) => {
    const {username, password, confirm_password, category} = req.body

    const result = await createService(username, password, confirm_password, category)

    if(result){
        res.status(200).send({status: result, message: "Successfully created!!!"})
    }else{
        res.status(500).send({status: result, message: "Not successfully created!!!"})
    }
})

router.get('/retreive', async(req, res) => {
    const {Fields} = req.query
    const result = await retreiveService(Fields)

    if(result){
        res.status(200).send(result)
    }else{
        res.status(500).send({status: result, message: "Not successfully retrieved!!!"})
    }
})

router.post('/update', async(req, res) => {
    const {id,newUsername, newPassword, newConfirm_password, newCategory} = req.body

    const result = await updateService(id,newUsername, newPassword, newConfirm_password, newCategory)

    if(result){
        res.status(200)
        .send({status: result, message: "Successfully updated!!!"})
    }else{
        res.status(500).send({status: result, message: "Not successfully updated!!!"})
    }
})

router.get('/delete', async(req, res) => {
    const {id} = req.query

    const result = await deleteService(id)

    if(result){
        res.status(200).send({status: result, message: "Successfully deleted!!!"})
    }else{
        res.status(500).send({status: result, message: "Not successfully deleted!!!"})
    }
})


module.exports = router