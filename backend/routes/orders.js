const router = require('express').Router();
const Product = require('../models/Product');
const auth = require('../middleware/Auth');

// Get all products
router.get('/', async (req,res)=>{
    const products = await Product.find();
    res.json(products);
});

// Admin: Add product
router.post('/', auth, async (req,res)=>{
    if(!req.user.isAdmin) return res.status(403).json({msg:'Access denied'});
    const {name,price,image} = req.body;
    const product = new Product({name,price,image});
    await product.save();
    res.json(product);
});

// Admin: Update product
router.put('/:id', auth, async (req,res)=>{
    if(!req.user.isAdmin) return res.status(403).json({msg:'Access denied'});
    const {name,price,image} = req.body;
    const product = await Product.findByIdAndUpdate(req.params.id,{name,price,image},{new:true});
    res.json(product);
});

// Admin: Delete product
router.delete('/:id', auth, async (req,res)=>{
    if(!req.user.isAdmin) return res.status(403).json({msg:'Access denied'});
    await Product.findByIdAndDelete(req.params.id);
    res.json({msg:'Product deleted'});
});

module.exports = router;