class MockupDetector {
    constructor() {
        // Create a temporary canvas for image analysis
        this.analysisCanvas = document.createElement('canvas');
        this.analysisCtx = this.analysisCanvas.getContext('2d', { willReadFrequently: true });
        
        // Debug mode for visualization
        this.debugMode = false;

        // Store current corner points
        this.currentCorners = null;
    }

    /**
     * Set the current corner points to use as reference
     * @param {Array<{x: number, y: number}>} corners 
     */
    setCurrentCorners(corners) {
        if (!corners || !Array.isArray(corners) || corners.length !== 4) {
            console.warn('Invalid corners provided:', corners);
            this.currentCorners = null;
            return;
        }
        this.currentCorners = corners;
        if (this.debugMode) {
            console.log('Current corners set to:', corners);
        }
    }

    /**
     * Calculate the total distance between two sets of points
     * @param {Array<{x: number, y: number}>} points1 
     * @param {Array<{x: number, y: number}>} points2 
     * @returns {number}
     */
    calculatePointsDistance(points1, points2) {
        if (!points1 || !points2 || points1.length !== 4 || points2.length !== 4) {
            console.warn('Invalid points for distance calculation:', { points1, points2 });
            return Infinity;
        }

        // Sort both sets of points clockwise from top-left
        const sorted1 = this.sortCorners(points1);
        const sorted2 = this.sortCorners(points2);

        // Calculate total Euclidean distance between corresponding points
        let totalDistance = 0;
        for (let i = 0; i < 4; i++) {
            const dx = sorted1[i].x - sorted2[i].x;
            const dy = sorted1[i].y - sorted2[i].y;
            totalDistance += Math.sqrt(dx * dx + dy * dy);
        }

        if (this.debugMode) {
            console.log('Distance calculation:', {
                points1: sorted1,
                points2: sorted2,
                totalDistance
            });
        }

        return totalDistance;
    }

    /**
     * Detects the corners of the light/white mockup area in an image
     * @param {HTMLImageElement} image - The background image to analyze
     * @returns {Promise<Array<{x: number, y: number}>>} Array of 4 corner points
     */
    async detectMockupArea(image) {
        if (this.debugMode) {
            console.log('Starting detection with current corners:', this.currentCorners);
        }

        // Wait for OpenCV to be ready
        if (!window.cv) {
            throw new Error('OpenCV is not loaded yet');
        }

        // Set canvas size to match image
        this.analysisCanvas.width = image.width;
        this.analysisCanvas.height = image.height;

        // Draw image onto analysis canvas
        this.analysisCtx.drawImage(image, 0, 0);

        try {
            // Convert canvas to cv.Mat
            const src = cv.imread(this.analysisCanvas);
            
            // Convert to grayscale
            const gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

            // Apply Gaussian blur to reduce noise
            const blurred = new cv.Mat();
            const ksize = new cv.Size(5, 5);
            cv.GaussianBlur(gray, blurred, ksize, 0);

            // Apply adaptive threshold with more tolerant parameters
            const binary = new cv.Mat();
            cv.adaptiveThreshold(
                blurred,
                binary,
                255,
                cv.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv.THRESH_BINARY,
                31,
                2
            );

            // Debug: Log binary image stats
            console.log('Binary image stats:', {
                width: binary.cols,
                height: binary.rows,
                channels: binary.channels(),
                type: binary.type(),
                totalWhitePixels: cv.countNonZero(binary)
            });

            // Apply morphological operations
            const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
            const cleaned = new cv.Mat();
            cv.morphologyEx(binary, cleaned, cv.MORPH_CLOSE, kernel);
            cv.morphologyEx(cleaned, cleaned, cv.MORPH_OPEN, kernel);

            // Find contours
            const contours = new cv.MatVector();
            const hierarchy = new cv.Mat();
            cv.findContours(
                cleaned,
                contours,
                hierarchy,
                cv.RETR_LIST,
                cv.CHAIN_APPROX_SIMPLE
            );

            // Debug: Log contours info
            console.log('Contours found:', {
                count: contours.size(),
                imageSize: cleaned.size()
            });

            if (contours.size() === 0) {
                throw new Error('No contours found');
            }

            // Debug: Log each contour's area
            for (let i = 0; i < contours.size(); i++) {
                const contour = contours.get(i);
                console.log(`Contour ${i} area:`, cv.contourArea(contour));
            }

            // Find potential mockup areas with more lenient criteria
            let bestContour = null;
            let bestScore = 0;
            let bestPoints = null;
            
            const totalArea = image.width * image.height;
            const maxAllowedArea = totalArea * 0.95; // Allow up to 95% of image area
            const minAllowedArea = 1000; // Fixed minimum area instead of percentage

            // Keep track of closest contour
            let closestDistance = Infinity;
            let closestContour = null;
            let closestPoints = null;
            
            for (let i = 0; i < contours.size(); i++) {
                const contour = contours.get(i);
                const area = cv.contourArea(contour);
                
                // Skip if area is too small or too large
                if (area < minAllowedArea || area > maxAllowedArea) {
                    if (this.debugMode) {
                        console.log(`Contour ${i} skipped - area ${area} outside bounds [${minAllowedArea}, ${maxAllowedArea}]`);
                    }
                    continue;
                }

                // Get rotated rectangle and its points
                const rect = cv.minAreaRect(contour);
                const points = cv.rotatedRectPoints(rect).map(pt => ({
                    x: Math.round(pt.x),
                    y: Math.round(pt.y)
                }));

                const aspectRatio = rect.size.width / rect.size.height;
                // More lenient aspect ratio bounds
                const isReasonableRatio = aspectRatio > 0.2 && aspectRatio < 5.0;

                // Calculate how rectangular the contour is
                const rectArea = rect.size.width * rect.size.height;
                const rectangularity = area / rectArea;
                
                // Basic shape check
                if (rectangularity < 0.6) {
                    continue;
                }

                let score;
                if (this.currentCorners) {
                    const distance = this.calculatePointsDistance(points, this.currentCorners);
                    
                    // Update closest contour if this is the closest so far
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestContour = contour;
                        closestPoints = points;
                    }

                    // Only consider contours that are reasonably close to current position
                    if (distance > 2000) { // Maximum distance threshold
                        continue;
                    }

                    // Linear distance scoring (inverse of distance)
                    const distanceScore = 1 - (distance / 2000);
                    
                    // Score based on distance and basic quality checks
                    score = distanceScore * 0.7 + // 70% weight for distance
                           rectangularity * 0.2 + // 20% weight for rectangularity
                           (isReasonableRatio ? 0.1 : 0); // 10% weight for aspect ratio
                    
                    if (this.debugMode) {
                        console.log(`Distance-based scoring for contour ${i}:`, {
                            distance,
                            distanceScore,
                            rectangularity,
                            finalScore: score
                        });
                    }
                } else {
                    // Without current corners, use the original balanced scoring
                    const areaScore = 1.0 - (Math.abs(area - (totalArea * 0.2)) / (totalArea * 0.2));
                    score = rectangularity * 0.4 + // 40% weight for rectangularity
                           (isReasonableRatio ? 0.3 : 0) + // 30% weight for aspect ratio
                           areaScore * 0.3; // 30% weight for area
                }

                if (this.debugMode) {
                    console.log(`Contour ${i} evaluation:`, {
                        area,
                        aspectRatio,
                        rectangularity,
                        hasCurrentCorners: !!this.currentCorners,
                        score,
                        points
                    });
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestContour = contour;
                    bestPoints = points;
                }
            }

            // If we have current corners but no good matches were found, use the closest contour
            if (this.currentCorners && !bestContour && closestContour) {
                bestContour = closestContour;
                bestPoints = closestPoints;
            }

            if (!bestContour) {
                throw new Error('No suitable contour found');
            }

            console.log('Best contour score:', bestScore);

            // If we don't have points yet, try to get them from the contour approximation
            if (!bestPoints) {
                const epsilon = 0.03 * cv.arcLength(bestContour, true);
                const approx = new cv.Mat();
                try {
                    cv.approxPolyDP(bestContour, approx, epsilon, true);

                    if (approx.rows === 4) {
                        bestPoints = [];
                        for (let i = 0; i < 4; i++) {
                            bestPoints.push({
                                x: approx.data32S[i * 2],
                                y: approx.data32S[i * 2 + 1]
                            });
                        }
                    } else {
                        // Fallback to rotated rectangle if approximation didn't give 4 points
                        const rect = cv.minAreaRect(bestContour);
                        bestPoints = cv.rotatedRectPoints(rect).map(pt => ({
                            x: Math.round(pt.x),
                            y: Math.round(pt.y)
                        }));
                    }
                } finally {
                    // Always clean up the approx Mat
                    approx.delete();
                }
            }

            // Debug visualization if needed
            if (this.debugMode) {
                const color = new cv.Scalar(255, 0, 0, 255);
                const debugMat = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC4);
                
                // Draw the contour
                const contourVec = new cv.MatVector();
                contourVec.push_back(bestContour);
                cv.drawContours(debugMat, contourVec, 0, color, 2);
                
                // Draw the corner points
                const pointColor = new cv.Scalar(0, 255, 0, 255);
                bestPoints.forEach(point => {
                    cv.circle(debugMat, new cv.Point(point.x, point.y), 5, pointColor, -1);
                });
                
                cv.imshow(this.analysisCanvas, debugMat);
                
                // Clean up
                contourVec.delete();
                debugMat.delete();
            }

            // Clean up OpenCV objects
            src.delete();
            gray.delete();
            blurred.delete();
            binary.delete();
            cleaned.delete();
            kernel.delete();
            contours.delete();
            hierarchy.delete();
            bestContour.delete();

            // Sort points in clockwise order
            return this.sortCorners(bestPoints);
        } catch (error) {
            console.error('OpenCV error:', error);
            throw new Error('Could not detect mockup area');
        }
    }

    /**
     * Sort corners in clockwise order: top-left, top-right, bottom-right, bottom-left
     */
    sortCorners(corners) {
        // Find center point
        const center = {
            x: corners.reduce((sum, p) => sum + p.x, 0) / corners.length,
            y: corners.reduce((sum, p) => sum + p.y, 0) / corners.length
        };

        // Sort corners based on their angle from center
        return corners.sort((a, b) => {
            const angleA = Math.atan2(a.y - center.y, a.x - center.x);
            const angleB = Math.atan2(b.y - center.y, b.x - center.x);
            return angleA - angleB;
        });
    }
}

export default MockupDetector; 