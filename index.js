const express = require('express')
const app = express()
const cors = require('cors')
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const stripe = require("stripe")(process.env.STRIPE_SECRET);


const port = process.env.PORT || 5000

//middlewear
app.use(cors())
app.use(express.json())

//middlewear for varify jwt
function jwtVerify(req, res, next) {

    const authHeader = req.headers.authorization;
    // console.log(authHeader)
    if (!authHeader) {

        return res.status(401).send('Unothorized User')
    }

    const token = authHeader.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN, function (error, decoded) {

        if (error) {

            return res.status(403).send('Forbbiden access')
        }

        req.decoded = decoded

        next()

    })

}

app.get('/', (req, res) => {
    res.send('HelpingHand Running on Server')
})

//MONGODB CONNECT
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.cko8evq.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {

    try {

        //create collection of users
        const usersCollection = client.db('HelpingHand').collection('users')

        //create collection of orders
        const ordersCollection = client.db('HelpingHand').collection('orders')

        //create collection of orders
        const paymentsCollection = client.db('HelpingHand').collection('payments')

        //verify admin
        const verifyAdmin = async (req, res, next) => {

            //verify
            const decodedEmail = req.decoded.email;
            const AdminQuery = { email: decodedEmail }
            const user = await usersCollection.findOne(AdminQuery)

            if (user?.role !== 'admin') {

                return res.status(403).send('Forbidden Access');
            }
            next()

        }

        //verify customer
        const verifyCustomer = async (req, res, next) => {

            //verify
            const decodedEmail = req.decoded.email;
            const CustomerQuery = { email: decodedEmail }
            const user = await usersCollection.findOne(CustomerQuery)

            if (user?.role !== 'customers') {

                return res.status(403).send('Forbidden Access');
            }
            next()

        }


        //post users
        app.post('/users', async (req, res) => {

            const user = req.body;
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })

        //post orders
        app.post('/orders', jwtVerify, verifyCustomer, async (req, res) => {

            const orders = req.body;
            const result = await ordersCollection.insertOne(orders)
            res.send(result)
        })

        //post payment-intent
        app.post('/create-payment-intent', jwtVerify, verifyCustomer, async (req, res) => {

            const order = req.body;
            const price = order?.price;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                currency: "usd",
                amount: amount,
                "payment_method_types": [

                    "card"
                ]
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });

        })

        //post payments
        app.post('/payment', jwtVerify, verifyCustomer, async (req, res) => {

            const payment = req.body
            const result = await paymentsCollection.insertOne(payment)
            const id = payment.orderId
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {

                    payment: 'paid',
                    transactionId: payment.transactionId
                }
            }
            const updatedResult = await ordersCollection.updateOne(filter, updatedDoc)
            res.json(result)
        })


        //get admin  to authorized route
        app.get('/user/admin/:email', async (req, res) => {

            const email = req.params.email;
            const query = { email: email }
            const result = await usersCollection.findOne(query)
            res.send({ isAdmin: result?.role === 'admin' })

        })

        //get customer  to authorized route
        app.get('/user/customer/:email', async (req, res) => {

            const email = req.params.email;
            const query = { email: email }
            const result = await usersCollection.findOne(query)
            res.send({ isCustomer: result?.role === 'customers' })

        })



        //get jwt by user email
        app.get('/jwt', async (req, res) => {

            const email = req.query.email
            const query = { email: email }
            const user = await usersCollection.findOne(query)

            //send jwt to client
            if (user) {

                const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '30d' })
                return res.send({ accessToken: token })

            }

            res.status(403).send({ accessToken: '' })

        })

        //get all users
        app.get('/allusers', jwtVerify, verifyAdmin, async (req, res) => {

            const query = {}
            const result = await usersCollection.find(query).toArray()
            res.send(result)
        })

        //get userprofile
        app.get('/userProfile', jwtVerify, verifyCustomer, async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const result = await usersCollection.find(query).sort({ _id: -1 }).toArray()
            res.send(result)
        })

        //get orders
        app.get('/orders', jwtVerify, verifyCustomer, async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const result = await ordersCollection.find(query).sort({ _id: -1 }).toArray()
            res.send(result)
        })

        //get orders by id
        app.get('/order/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await ordersCollection.findOne(query)
            res.send(result)
        })

        //get allorders
        app.get('/allorders', jwtVerify, verifyAdmin, async (req, res) => {
            const query = {}
            const result = await ordersCollection.find(query).sort({ _id: -1 }).toArray()
            res.send(result)
        })

        //create admin
        app.put('/admin/:id', jwtVerify, verifyAdmin, async (req, res) => {

            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const updatedDoc = {

                $set: {
                    role: 'admin'
                }
            }

            const result = await usersCollection.updateOne(filter, updatedDoc, options)
            res.send(result)
        })

        //update order status to confirm
        app.put('/acceptStatus/:id', jwtVerify, verifyAdmin, async (req, res) => {

            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const updatedDoc = {

                $set: {
                    status: 'Confirmed'
                }
            }

            const result = await ordersCollection.updateOne(filter, updatedDoc, options)
            res.send(result)
        })

        //update booking status to cancel
        app.put('/cancelStatus/:id', jwtVerify, verifyAdmin, async (req, res) => {

            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const updatedDoc = {

                $set: {
                    status: 'Canceled'
                }
            }

            const result = await ordersCollection.updateOne(filter, updatedDoc, options)
            res.send(result)
        })

    }

    finally {


    }

}

run().catch(console.dir)




app.listen(port, () => {

    console.log(`HelpingHand runs on port ${port}`)

})