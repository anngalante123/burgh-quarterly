/**
 * Minimal typing for the Apify Google Maps raw record we consume in the pilot.
 * Only the fields the business page actually reads are modeled here.
 * Full record has ~55 fields — see content/raw/apify/la-gourmandine-raw.json.
 */

export type RawApifyReview = {
  reviewerId: string;
  name: string;
  reviewerPhotoUrl?: string | null;
  text: string | null;
  textTranslated?: string | null;
  publishAt?: string | null; // "3 days ago"
  publishedAtDate?: string | null; // ISO
  stars: number;
  reviewImageUrls?: string[];
};

export type RawApifyBusiness = {
  title: string;
  categoryName: string;
  neighborhood: string | null;
  address: string;
  website?: string | null;
  totalScore: number | null;
  reviewsCount: number | null;
  reviewsDistribution: {
    oneStar: number;
    twoStar: number;
    threeStar: number;
    fourStar: number;
    fiveStar: number;
  } | null;
  imagesCount: number | null;
  imageUrl?: string | null;
  imageUrls?: string[];
  reviews: RawApifyReview[];
};
