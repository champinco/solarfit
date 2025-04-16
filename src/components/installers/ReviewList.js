import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { StarIcon, UserCircleIcon } from '@heroicons/react/solid';
import ReviewForm from './ReviewForm';

const StarRating = ({ rating }) => {
  return (
    <div className="flex">
      {[1, 2, 3, 4, 5].map((star) => (
        <StarIcon
          key={star}
          className={`h-5 w-5 ${
            star <= rating ? 'text-yellow-400' : 'text-gray-300'
          }`}
        />
      ))}
    </div>
  );
};

const ReviewItem = ({ review }) => {
  return (
    <div className="border-b border-gray-200 pb-4 mb-4 last:border-b-0">
      <div className="flex items-center mb-2">
        <UserCircleIcon className="h-10 w-10 text-gray-400 mr-3" />
        <div>
          <h4 className="text-sm font-medium text-gray-800">
            {review.userName || 'Anonymous User'}
          </h4>
          <div className="flex items-center">
            <StarRating rating={review.rating} />
            <span className="text-xs text-gray-500 ml-2">
              {new Date(review.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
      {review.comment && (
        <p className="text-gray-600 text-sm mt-2">{review.comment}</p>
      )}
    </div>
  );
};

const ReviewList = ({ installerId }) => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    fetchReviews();
    const token = localStorage.getItem('userToken');
    setIsAuthenticated(!!token);
  }, [installerId]);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/reviews?installerId=${installerId}`);
      setReviews(response.data);
    } catch (error) {
      setError('Error loading reviews.');
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReviewSubmit = () => {
    fetchReviews();
    setShowReviewForm(false);
  };

  const handleAddReviewClick = () => {
    if (!isAuthenticated) {
      if (window.confirm('You need to log in to submit a review. Would you like to log in now?')) {
        // Redirect to login page
        window.location.href = '/login?returnUrl=' + encodeURIComponent(window.location.pathname);
      }
    } else {
      setShowReviewForm(true);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded mb-4">
          {error}
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-800">
          Customer Reviews ({reviews.length})
        </h3>
        <button
          onClick={handleAddReviewClick}
          className="text-sm px-3 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
        >
          Write a Review
        </button>
      </div>

      {reviews.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-gray-300 rounded-md">
          <p className="text-gray-500">No reviews yet. Be the first to review!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <ReviewItem key={review._id} review={review} />
          ))}
        </div>
      )}

      {showReviewForm && (
        <div className="mt-6 border-t border-gray-200 pt-6">
          <h3 className="text-lg font-medium text-gray-800 mb-4">Write Your Review</h3>
          <ReviewForm 
            installerId={installerId} 
            onSuccess={handleReviewSubmit} 
            onCancel={() => setShowReviewForm(false)} 
          />
        </div>
      )}
    </div>
  );
};

export default ReviewList; 