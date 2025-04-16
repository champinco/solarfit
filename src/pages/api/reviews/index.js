import { MongoClient } from 'mongodb';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const db = client.db();

  if (req.method === 'POST') {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const { installerId, rating, comment } = req.body;

      // Create new review
      const review = {
        installerId,
        userId: decoded.id,
        rating,
        comment,
        createdAt: new Date(),
      };

      const result = await db.collection('reviews').insertOne(review);

      // Update installer's average rating
      const reviews = await db.collection('reviews')
        .find({ installerId })
        .toArray();

      const averageRating = reviews.reduce((acc, review) => acc + review.rating, 0) / reviews.length;

      await db.collection('installers').updateOne(
        { _id: installerId },
        { $set: { rating: averageRating } }
      );

      res.status(201).json({
        message: 'Review submitted successfully',
        reviewId: result.insertedId,
      });
    } catch (error) {
      console.error('Error creating review:', error);
      res.status(500).json({ message: 'Error creating review' });
    }
  } else if (req.method === 'GET') {
    try {
      const { installerId } = req.query;
      const reviews = await db.collection('reviews')
        .find({ installerId })
        .sort({ createdAt: -1 })
        .toArray();

      res.status(200).json(reviews);
    } catch (error) {
      console.error('Error fetching reviews:', error);
      res.status(500).json({ message: 'Error fetching reviews' });
    }
  }

  client.close();
} 