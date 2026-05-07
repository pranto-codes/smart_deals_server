const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const app = express();
const admin = require("firebase-admin");
const port = process.env.PORT || 3000;

const serviceAccount = require("./smart-deals-firebase-admin.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

//middleware
app.use(cors());
app.use(express.json());

const logger = (req, res, next) => {
  console.log("logging information");
  next();
};

//const verifyFirebaseToken = (req, res, next) => {
//  console.log("in the middleware", req.headers.authorization);
//
//  if (!req.headers.authorization) {
//    // do not allow it
//    return res.status(401).send({ message: "authorization token not found" });
//  }
//  const token = req.headers.authorization.split(' ')[1];
//  if (!token) {
//    return res.status(401).send({ message: "token not found" });
//  }
//
//  //verify token
//  //
//  next();
//};

//const verifyFireBaseToken = async (req, res, next) => {
//  if (!req.headers.authorization) {
//    res.status(401).send({ message: "unauthorized access" });
//  }
//
//  const token = req.headers.authorization.split(' ')[1];
//  if (!token) {
//    return res.status(401).send({ message: "unauthorized access token" });
//  }
//
//  try {
//    const userInfo = await admin.auth().verifyIdToken(token);
//    console.log("after token validated", userInfo);
//    next();
//  } catch {
//    return res.status(401).send({ message: "unauthorized access" });
//  }
//  // verify id token
//};

//const verifyFireBaseToken = async (req, res, next) => {
//  if (!req.headers.authorization) {
//    return res.status(401).send({ message: "unauthorized access token" });
//  }
//  const token = req.headers.authorization.split(" ")[1];
//  if (!token) {
//    return res.status(401).send({ message: "unauthorized token" });
//  }
//
//  try {
//    const userInfo = await admin.auth().verifyIdToken(token);
//    req.token_email = userInfo.email;
//    console.log("after token validation", userInfo);
//    next();
//  } catch {
//    return res.status(401).send({ message: "unauthorized token" });
//  }
//  //verify id token
//};

const verifyFireBaseToken = async (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res.status(401).send({ message: "authorization denied" });
  }

  const token = authorization.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    console.log("inside token", decoded);
    req.token_email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: "authorization denied" });
  }
  //next()
};

const verifyJWTToken = (req, res, next) => {
  // console.log("headers in middleware", req.headers);
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res.status(401).send({ message: "no authorization" });
  }

  const token = authorization.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "unauthorized token" });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "no authorization" });
    }

    // right place
    console.log("after decoded", decoded);
    req.token_email = decoded.email;
    next();
  });

  ///
};

const uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASSWORD}@ac-cu7z8ae-shard-00-00.9vnu5tk.mongodb.net:27017,ac-cu7z8ae-shard-00-01.9vnu5tk.mongodb.net:27017,ac-cu7z8ae-shard-00-02.9vnu5tk.mongodb.net:27017/?ssl=true&replicaSet=atlas-bqho0m-shard-0&authSource=admin&appName=prantoDB`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("smart server is running");
});

async function run() {
  try {
    await client.connect();

    const db = client.db("smartdb");
    const productsCollection = db.collection("products");
    const bidsCollection = db.collection("bids");
    const usersCollection = db.collection("users");

    //jwt related APIs
    app.post("/getToken", (req, res) => {
      const loggedUser = req.body;
      const token = jwt.sign(loggedUser, process.env.JWT_SECRET, {
        expiresIn: "1hour",
      });
      res.send({ token: token });
    });

    //users api
    app.post("/users", async (req, res) => {
      const newUser = req.body;

      const email = req.body.email;
      const query = { email: email };

      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        res.send({ message: "user already exists" });
      } else {
        const result = await usersCollection.insertOne(newUser);
        res.send(result);
      }
    });

    //products api
    app.get("/products", async (req, res) => {
      //  const cursor = productsCollection.find().sort({ price_min: 1 }).limit(3);

      console.log(req.query);
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      }

      const cursor = productsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    //latest-products api
    app.get("/latest-products", async (req, res) => {
      const cursor = productsCollection
        .find()
        .sort({ created_at: -1 })
        .limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.findOne(query);
      res.send(result);
    });

    app.post("/products", verifyFireBaseToken, async (req, res) => {
      console.log("headers in the post", req.headers);
      const newProduct = req.body;
      const result = await productsCollection.insertOne(newProduct);
      res.send(result);
    });

    app.patch("/products/:id", async (req, res) => {
      const id = req.params.id;
      const updatedProduct = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          name: updatedProduct.name,
          price: updatedProduct.price,
        },
      };
      const result = await productsCollection.updateOne(query, update);
      res.send(result);
    });

    app.delete("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.deleteOne(query);
      res.send(result);
    });

    ///bids related api
    // app.get("/bids", async (req, res) => {
    //   const email = req.query.email;
    //   const query = {};
    //   if (email) {
    //     query.buyer_email = email;
    //   }
    //
    //   const cursor = bidsCollection.find(query);
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });
    //

    app.get(
      "/products/bids/:productId",
      verifyFireBaseToken,
      async (req, res) => {
        const productId = req.params.productId;
        const query = { product: productId };
        const cursor = bidsCollection.find(query).sort({ bid_price: -1 });
        const result = await cursor.toArray();
        res.send(result);
      },
    );

    app.get("/bids", verifyFireBaseToken, async (req, res) => {
      // console.log("headers", req.headers);
      const email = req.query.email;
      const query = {};
      if (email) {
        query.buyer_email = email;
      }

      //verified user have access to see this data
      if (email !== req.token_email) {
        return res.status(403).send({ message: "unauthorized/ forbidden" });
      }

      const cursor = bidsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    // bids related api w firebase token verify
    // app.get("/bids", logger, verifyFireBaseToken, async (req, res) => {
    //   //  console.log("headers", req.headers);
    //   console.log("headers", req);
    //   const email = req.query.email;
    //   const query = {};
    //   if (email) {
    //     if (email !== req.token_email) {
    //       return res.status(403).send({ message: "forbidden access" });
    //     }
    //
    //     query.buyer_email = email;
    //   }
    //
    //   const cursor = bidsCollection.find(query);
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });

    app.post("/bids", async (req, res) => {
      const newBid = req.body;
      const result = await bidsCollection.insertOne(newBid);
      res.send(result);
    });

    app.delete("/bids/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bidsCollection.deleteOne(query);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
