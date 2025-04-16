import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const db = client.db();

  try {
    const { email, password } = req.body;

    // Find installer
    const installer = await db.collection('installers').findOne({ email });
    if (!installer) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, installer.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: installer._id, email, role: 'installer' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Remove password from response
    const { password: _, ...installerWithoutPassword } = installer;

    res.status(200).json({
      message: 'Login successful',
      token,
      installer: installerWithoutPassword,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error logging in' });
  } finally {
    client.close();
  }
} 