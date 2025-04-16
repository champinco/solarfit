import React, { useState } from 'react';
import axios from 'axios';
import { StarIcon } from '@heroicons/react/solid';
import { StarIcon as StarOutline } from '@heroicons/react/outline';

const ReviewForm = ({ installerId, onSuccess, onCancel }) => {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [hoverRating, setHoverRating] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (rating === 0) {
      setError('Please select a rating');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('userToken');
      
      if (!token) {
        setError('You must be logged in to submit a review');
        return;
      }

      const response = await axios.post('/api/reviews', {
        installerId,
        rating,
        comment
      }, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (onSuccess) {
        onSuccess(response.data);
      }
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to submit review. Please try again.');
      console.error('Review submission error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
            <div className="flex">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 focus:outline-none"
                >
                  {star <= (hoverRating || rating) ? (
                    <StarIcon className="h-7 w-7 text-yellow-400" />
                  ) : (
                    <StarOutline className="h-7 w-7 text-gray-300" />
                  )}
                </button>
              ))}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {rating === 1 && 'Poor'}
              {rating === 2 && 'Fair'}
              {rating === 3 && 'Good'}
              {rating === 4 && 'Very Good'}
              {rating === 5 && 'Excellent'}
            </div>
          </div>
          
          <div>
            <label htmlFor="comment" className="block text-sm font-medium text-gray-700">Your Review</label>
            <textarea
              id="comment"
              rows="4"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your experience with this installer..."
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          
          <div className="flex justify-end space-x-3">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ReviewForm; 