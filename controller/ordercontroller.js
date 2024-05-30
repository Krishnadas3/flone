const Product = require('../models/product');
const Cart = require('../models/cart')
const user = require('../models/users');
const Order = require('../models/orederModel')
const Category = require('../models/category')
const uuid = require("uuid");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const { default: mongoose } = require('mongoose');
const { name } = require('ejs');
const { stat } = require('fs');
require("dotenv").config();


var instance = new Razorpay({

  key_id: process.env.KEY_ID,

  key_secret: process.env.KEY_SECRET,

});

let loadcheckout = async (req, res) => {
    // console.log("hey ividek vannu nammal ");
    try {
        const isAuthenticated = req.cookies.jwt !== undefined;
        const id = req.user.id;
        const userId = req.user.id;
        const User = await user.find({ _id: id })
        const cart = await Cart.findOne({ userId: userId }).populate('products.productId');

        if (!cart || cart.products.length === 0) {
            return res.render('user/cartpage', { products: [], cartTotalPrice: 0 });
        }
        const cartTotalPrice = cart.products.reduce((total, item) => total + (item.price * item.qty), 0);
        const productsInCart = cart.products.map(item => ({
            _id: item.productId._id,
            images: item.productId.images,
            productName: item.productId.productName,
            price: item.price,
            qty: item.qty,
            productTotalprice: item.productTotalprice
        }));
        res.render('user/checkout', { isAuthenticated, User, products: productsInCart, cartTotalPrice })
    } catch (error) {
        console.error('failed to get login page', error)
        res.status(500).send('intenal server error')
    }
}

const place_order = async (req, res) => {
  try {
      const id = req.user.id;

      const User = await user.findOne({_id: id});

      const orderData = req.body;
    //   console.log('Received orderData:', orderData);/

      // Ensure all order data fields are arrays
      if (!Array.isArray(orderData.productId)) {
          orderData.productId = [orderData.productId];
      }
      if (!Array.isArray(orderData.qty)) {
          orderData.qty = [orderData.qty];
      }
      if (!Array.isArray(orderData.singleTotel)) {
          orderData.singleTotel = [orderData.singleTotel];
      }
      if (!Array.isArray(orderData.price)) {
          orderData.price = [orderData.price];
      }

      const productPush = [];

      for (let i = 0; i < orderData.productId.length; i++) {
          let productId = orderData.productId[i];
          let quantity = orderData.qty[i];
          let singleTotal = orderData.singleTotel[i];
          let price = orderData.price[i];
          
          productPush.push({
              productid: productId,
              qty: quantity,
              singlePrice: price,
              singleTotel: singleTotal
          });
      }

      let status;

      if(req.body.payment_method === "COD" || req.body.payment_method === "UPI"){
          status = "Confirmed";
      } else if (req.body.payment_method === "WALLET"){
          if(User.wallet < orderData.totel){
              res.json({wallet: false});
              return;
          }
          status = "Confirmed";
      }

      const index = req.body.user;
        
    //   console.log("hey here got the index", index);

      const address = {
        name: User.address[index].name,
        number: User.address[index].number,
        pincode: User.address[index].pincode,
        state: User.address[index].state,
        district: User.address[index].district,
        place: User.address[index].place,
        street: User.address[index].street,
        building: User.address[index].building,
    };

      const totel = req.body.total;

      const orderId = `Order#${uuid.v4()}`;
    //   console.log("Generated orderId:", orderId);

      const order = new Order({
        userId: req.user.id,
        address: address,
        product: productPush,
        total: totel,
        paymentType: req.body.payment_method,
        status: status,
        orderId: orderId,
      });

      const neworderData = await order.save();

      // console.log("hey  here got the neworderData",neworderData);

      if (req.body.payment_method == "COD") {
        res.json({ status: true });
      } 

      
      else if (req.body.payment_method == "UPI") {
        let options = {
            amount: req.body.total * 100, // amount in paise
            currency: "INR",
            receipt: "" + neworderData._id,
        };

        console.log("Creating Razorpay order with options:", options);

        instance.orders.create(options, (err, order) => {
            if (err) {
                console.error("Error creating Razorpay order:", err);
                return res.status(500).send("Internal server error");
            }
            res.json({ viewRazorpay: true, order });
        });

      } else if (req.body.payment_method == "WALLET") {
          const walupdate = User.wallet - orderData.total;
          await user.updateOne({ _id: id }, { $set: { wallet: walupdate } });
          res.json({ status: true });
      }

  } catch (error) {
      console.error('Failed to place order:', error);
      res.status(500).send('Internal server error');
  }
};


const verify_payment = async (req, res) => {
  try {

    const id = req.user.id;

    console.log("hey here got the id ",id);

    const latestOrder = await Order.findOne().sort({ date: -1 });

    console.log("hey here got the latestOrder ",latestOrder);

    const upadateOrder = await Order.updateOne(
      { orderId: latestOrder.orderId },
      { $set: { status: "Confirmed" } }
    );

    console.log("ivide upadateoruder",upadateOrder);

    const details = req.body;

    console.log("hey njn details",details);

    let hmac = crypto.createHmac("sha256", process.env.KEY_SECRET);
    console.log("heey",hmac);
    hmac.update(
      details["payment[razorpay_order_id]"] +
      "|" +
      details["payment[razorpay_payment_id]"]
    );
    hmac = hmac.digest("hex");
    if (hmac == details["payment[razorpay_signature]"]) {
      res.json({ status: true });
    } else {
      res.json({ failed: true });
    }
  } catch (error) {

    res.render('500');
    console.log(error.message);

  }
  
};


let order_success = async (req, res) => {
  try {
      const isAuthenticated = req.cookies.jwt !== undefined;
      const User = req.user.id
      console.log("here got the user",User);
      const userdata = await user.findOne({_id:User})
      console.log("hey here got the userdata",userdata);

      const removeing = await user.updateOne(
        { _id: User },
        { $set: { cart: [], cartTotel: 0 } }
      );

      console.log("hey here got the remoeing ",removeing);

      const order = await Order.findOne().sort({ date: -1 }).populate({ path: 'product', populate: { path: 'productid', model: 'Product' } })

      console.log("here got the order",order);


      for (let i = 0; i < order.product.length; i++) {
        await Product.updateOne(
          { _id: order.product[i].productid },
          { $inc: { quantity: -order.product[i].qty } }
        );
        console.log("hey ");
      }
      // let products = await Products.find();
      res.render('user/order_success', { isAuthenticated,User,order,userdata });
  } catch (error) {
      console.error('Failed to get home:', error);
      res.status(500).send('Internal server error');
  }
}


const load_order = async (req, res) => {
  try {
    const order = await Order.find()
    let User = await user.find();
    res.render("admin/list-order",{order,User});
  } catch (error) {

    // res.render('500');
    console.log(error.message);

  }
};


const cancel_order = async (req, res) => {
  try {
    const orderId = req.body.orderId;
  const userid = req.user.id

  const cancel = await Order.updateOne(
    { _id: orderId },
    { $set: { status: "Cancelled" } }
  );
  console.log("hey her got the cancel ",cancel);
  const orderdata = await Order.findOne({ _id: orderId });
  if (orderdata.paymentType == "UPI") {
    const refund = await user.updateOne(
      { _id: userid },
      { $inc: { wallet: orderdata.total } }
    );
  }

  if (cancel) {
    res.json({ success: true });
  }
} catch (error) {
  res.render('500');
  console.log(error.message);
}
};


const show_orderlist = async (req, res) => {
  try {

    const isAuthenticated = req.cookies.jwt !== undefined;

    const id = req.user.id;

    const User = await user.findOne({ _id: id });

    const orders = await Order.find({ userId: User });

    // const category = await Category.find();

    res.render("user/list-orders", { isAuthenticated,User,orders });

  } catch (error) {
    res.render('500');
    console.log(error.message);

  }

};
  

const view_order_user = async (req, res) => {
  try {
    const isAuthenticated = req.cookies.jwt !== undefined;

    const user = true;
    const order_id = req.query.id;

    // const category = await Category.find();

    const order = await Order.find({ _id: order_id }).populate(

      "product.productid"

    );

    res.render("user/view-order", { isAuthenticated, order, user });

} catch (error) {
    console.error("Error fetching order:", error.message);
    res.render('500');
}
};


const view_order_admin = async (req, res) => {
  try {

    const user = req.user.id;

    const order_id = req.query.id;

    console.log("ayyoo kitti order_id",order_id);

    const order = await Order.find({ _id: order_id }).populate(

      "product.productid"

    );

    console.log("hey here got the order ",order);

    const user_id = await Order.find()

    res.render("admin/view-order",{order,user_id,user});

  } catch (error) {

    res.render('500');
    console.log(error.message);

  }

};

  

// admin 

const updateStatus = async (req, res) => {
  try {
    const orderId = req.body.order_Id;

    console.log("hey here got the orderId",orderId);

    const status = req.body.status;

    console.log("hey here got thte status ",status);

    const update = await Order.updateOne(
      { _id: orderId },
      
      { $set: { status: status } }
      
    );
   
    console.log("nammuk kittan update",update);

    res.json({ success: true });
  } catch (error) {
    res.render('500');
    console.log(error.message);
  }
};



  


module.exports = {
    loadcheckout,
    order_success,
    place_order,
    cancel_order,
    verify_payment,
    show_orderlist,
    view_order_user,
    load_order,
    updateStatus,
    view_order_admin
}