const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wvrng.mongodb.net/?retryWrites=true&w=majority`; 
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
      if (err) {
        return res.status(403).send({ message: 'Forbidden access' })
      }
      req.decoded = decoded;
      next();
    });
  }


async function run() {
    try {
      await client.connect();

      const itemCollection = client.db('assignment-12').collection('items');
      const reviewCollection = client.db('assignment-12').collection('reviews');
      const bookingCollection = client.db('assignment-12').collection('bookings');
      const userCollection = client.db('assignment-12').collection('users');
      const paymentCollection = client.db('assignment-12').collection('payments');

    const verifyAdmin = async (req, res, next) => {
        const requester = req.decoded.email;
        const requesterAccount = await userCollection.findOne({ email: requester });
        if (requesterAccount.role === 'admin') {
          next();
        }
        else {
          res.status(403).send({ message: 'forbidden' });
        }
      }
      //payment
      app.post('/create-payment-intent', verifyJWT, async(req, res) =>{
        const service = req.body;
        const price = service.price;
        const amount = price*100;
        const paymentIntent = await stripe.paymentIntents.create({
          amount : amount,
          currency: 'usd',
          payment_method_types:['card']
        });
        res.send({clientSecret: paymentIntent.client_secret})
      });

      app.patch('/booking/:id', verifyJWT, async(req, res) =>{
        const id  = req.params.id;
        const payment = req.body;
        const filter = {_id: ObjectId(id)};
        const updatedDoc = {
          $set: {
            paid: true,
            transactionId: payment.transactionId
          }
        }
  
        const result = await paymentCollection.insertOne(payment);
        const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc);
        res.send(updatedBooking);
      })
      //admin order
      app.post("/deleteOrder", async (req, res) => {
        const userID = await req.body.UserId;
        await bookingCollection.deleteOne({ _id: ObjectId(userID) });
  
        res.json("Deleted!");
      });
      app.get("/manageAllOrders",verifyJWT,verifyAdmin, async (req, res) => {
        const allUserOrders = await bookingCollection.find({}).toArray();
  
        res.send(allUserOrders);
      });
      app.post("/updateStatus", async (req, res) => {
        const status = await req.body.status;
        const id = await req.body.id;
  
        const filter = { _id: ObjectId(id) };
        await bookingCollection.updateOne(filter, { $set: { status: status } });
  
        res.json("updated");
      });
    //item get
    app.get('/item', async (req, res) => {
        const query = {};
        const cursor = itemCollection.find(query);
        const items = await cursor.toArray();
        res.send(items);
      });
    app.post('/item', async (req, res) => {
        const item = req.body;
      const result = await itemCollection.insertOne(item);
      res.send(result);
      });

      app.delete('/item/:id', async (req, res) => {
        const id = req.params.id;
        const filter = { _id: ObjectId(id) };
        const result = await itemCollection.deleteOne(filter);
        res.send(result);
      });
        app.get('/item/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const item = await itemCollection.findOne(query);
            res.send(item);
        });
        app.put('/item/:id',async(req,res)=>{
          const id = req.params.id;
          const qtn = parseInt(req.body.available);
          const query = {_id: ObjectId(id)};
          const item=await itemCollection.findOne(query);
          if(item){
              const data=qtn;
          
          const result= await itemCollection.updateOne(query,{$set:{available:data}});
          res.send(result);
          }
      });
      //booking get
      app.get('/mybooking', verifyJWT, async (req, res) => {
        const email = req.query.email;
        const decodedEmail = req.decoded.email;
        if (email === decodedEmail) {
          const query = { email: email };
          const bookings = await bookingCollection.find(query).toArray();
          return res.send(bookings);
        }
        else {
          return res.status(403).send({ message: 'forbidden access' });
        }
      });
  
      app.get('/booking/:id', verifyJWT, async(req, res) =>{
        const id = req.params.id;
        const query = {_id: ObjectId(id)};
        const booking = await bookingCollection.findOne(query);
        res.send(booking);
      })
  
      app.delete('/booking/:id', async (req, res) => {
        const id = req.params.id;
        const filter = { _id: ObjectId(id) };
        const result = await bookingCollection.deleteOne(filter);
        res.send(result);
      });
      app.post('/booking', async (req, res) => {
        const booking = req.body;
        
        const result = await bookingCollection.insertOne(booking);
        
        return res.send( result);
      });
  
      //review get
      app.get('/review', async (req, res) => {
        const query = {};
        const cursor = reviewCollection.find(query);
        const reviews = await cursor.toArray();
        res.send(reviews);
      });
    app.post('/review', async (req, res) => {
        const review = req.body;
      const result = await reviewCollection.insertOne(review);
      res.send(result);
      });
//all user get done
      app.get('/user', async (req, res) => {
        const users = await userCollection.find().toArray();
        res.send(users);
      });

   
      app.get('/admin/:email', async (req, res) => {
        const email = req.params.email;
        const user = await userCollection.findOne({ email: email });
        const isAdmin = user.role === 'admin';
        res.send({ admin: isAdmin })
      })

    //admin create done
    
    app.put('/user/admin/:email', verifyJWT,verifyAdmin, async (req, res) => {
        const email = req.params.email;
        const filter = { email: email };
        const updateDoc = {
          $set: { role: 'admin' },
        };
        
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      })
      //user done
      app.put('/user/:email', async (req, res) => {
        const email = req.params.email;
        const user = req.body;
        const filter = { email: email };
        const options = { upsert: true };
        const updateDoc = {
          $set: user,
        };
        const result = await userCollection.updateOne(filter, updateDoc, options);
        const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
        res.send({ result, token });
        
      });

     
   
    }
    finally {
  
    }
  }
  
  run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello assignment-12')
  })
  
  app.listen(port, () => {
    console.log(`Assignment-12 listening on port ${port}`)
  })
  