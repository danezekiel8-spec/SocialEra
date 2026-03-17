const router = require('express').Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Register
router.post('/register', async (req,res)=>{
    const {username,email,password} = req.body;
    try{
        let user = await User.findOne({email});
        if(user) return res.status(400).json({msg:'User already exists'});
        user = new User({username,email,password});
        await user.save();
        const token = jwt.sign({id:user._id,isAdmin:user.isAdmin}, process.env.JWT_SECRET,{expiresIn:'1d'});
        res.json({token});
    }catch(err){res.status(500).send(err.message);}
});

// Login
router.post('/login', async (req,res)=>{
    const {email,password} = req.body;
    try{
        const user = await User.findOne({email});
        if(!user) return res.status(400).json({msg:'User not found'});
        const isMatch = await bcrypt.compare(password,user.password);
        if(!isMatch) return res.status(400).json({msg:'Invalid credentials'});
        const token = jwt.sign({id:user._id,isAdmin:user.isAdmin}, process.env.JWT_SECRET,{expiresIn:'1d'});
        res.json({token,isAdmin:user.isAdmin});
    }catch(err){res.status(500).send(err.message);}
});

module.exports = router;