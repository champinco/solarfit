import { MongoClient } from 'mongodb';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const db = client.db();

  if (req.method === 'POST') {
    try {
      const { installerId, customerDetails, systemRequirements } = req.body;
      
      // Create new quote request
      const quoteRequest = {
        installerId,
        customerDetails,
        systemRequirements,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await db.collection('quotes').insertOne(quoteRequest);

      // Notify installer (you can implement email notification here)
      
      res.status(201).json({
        message: 'Quote request submitted successfully',
        quoteId: result.insertedId,
      });
    } catch (error) {
      console.error('Error creating quote request:', error);
      res.status(500).json({ message: 'Error creating quote request' });
    }
  } else if (req.method === 'GET') {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const installerId = decoded.id;

      const quotes = await db.collection('quotes')
        .find({ installerId })
        .sort({ createdAt: -1 })
        .toArray();

      res.status(200).json(quotes);
    } catch (error) {
      console.error('Error fetching quotes:', error);
      res.status(500).json({ message: 'Error fetching quotes' });
    }
  }

  client.close();
} 