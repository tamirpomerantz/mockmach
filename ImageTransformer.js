class ImageTransformer {
    constructor(ctx) {
        this.ctx = ctx;
    }

    /**
     * Draws an image onto a canvas with perspective transformation based on corner points
     * @param {HTMLImageElement} image - The image to transform
     * @param {Array<{x: number, y: number}>} cornerPoints - Array of 4 points for image corners
     * @param {string} blendMode - The blend mode to use for drawing
     * @param {boolean} highQuality - Whether to use high quality rendering (slower)
     */
    drawImage(image, cornerPoints, blendMode = 'source-over', highQuality = false) {
        if (!image || cornerPoints.length !== 4) return;

        // Create a temporary canvas for the transformed image
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

        // Enable image smoothing on both contexts
        tempCtx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingEnabled = true;

        if (highQuality) {
            tempCtx.imageSmoothingQuality = 'high';
            this.ctx.imageSmoothingQuality = 'high';
        } else {
            tempCtx.imageSmoothingQuality = 'medium';
            this.ctx.imageSmoothingQuality = 'medium';
        }

        // Set size to match the bounding box of target points
        const bounds = this.getBoundingBox(cornerPoints);
        // Scale up only in high quality mode
        const scale = highQuality ? 2 : 1;
        tempCanvas.width = bounds.width * scale;
        tempCanvas.height = bounds.height * scale;

        // Calculate the homography matrix from normalized coordinates
        const sourcePoints = [
            {x: 0, y: 0},                  // top-left
            {x: image.width, y: 0},        // top-right
            {x: image.width, y: image.height}, // bottom-right
            {x: 0, y: image.height}        // bottom-left
        ];

        // Adjust target points relative to the temporary canvas and scale them
        const adjustedTargetPoints = cornerPoints.map(p => ({
            x: (p.x - bounds.minX) * scale,
            y: (p.y - bounds.minY) * scale
        }));

        // Calculate the homography matrix
        const H = this.computeHomography(sourcePoints, adjustedTargetPoints);
        const Hinv = this.invertMatrix(H);

        // Create ImageData for pixel manipulation
        const imageData = tempCtx.createImageData(tempCanvas.width, tempCanvas.height);
        
        // Get source image data
        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = image.width;
        sourceCanvas.height = image.height;
        const sourceCtx = sourceCanvas.getContext('2d');
        sourceCtx.imageSmoothingEnabled = true;
        sourceCtx.imageSmoothingQuality = highQuality ? 'high' : 'medium';
        sourceCtx.drawImage(image, 0, 0);
        const sourceData = sourceCtx.getImageData(0, 0, image.width, image.height).data;

        // Transform each pixel
        for (let y = 0; y < tempCanvas.height; y++) {
            for (let x = 0; x < tempCanvas.width; x++) {
                if (highQuality) {
                    // Use supersampling only in high quality mode
                    const samples = this.getSamplePoints(x, y, 2);
                    let r = 0, g = 0, b = 0, a = 0;
                    let validSamples = 0;

                    samples.forEach(sample => {
                        const source = this.applyHomography(Hinv, sample.x, sample.y);
                        
                        if (source.x >= 0 && source.x < image.width && 
                            source.y >= 0 && source.y < image.height) {
                            const colors = this.bilinearInterpolation(sourceData, image.width, source.x, source.y);
                            r += colors.r;
                            g += colors.g;
                            b += colors.b;
                            a += colors.a;
                            validSamples++;
                        }
                    });

                    if (validSamples > 0) {
                        const idx = (y * tempCanvas.width + x) * 4;
                        imageData.data[idx] = r / validSamples;     // R
                        imageData.data[idx + 1] = g / validSamples; // G
                        imageData.data[idx + 2] = b / validSamples; // B
                        imageData.data[idx + 3] = a / validSamples; // A
                    }
                } else {
                    // Fast mode: single sample per pixel
                    const source = this.applyHomography(Hinv, x, y);
                    
                    if (source.x >= 0 && source.x < image.width && 
                        source.y >= 0 && source.y < image.height) {
                        const colors = this.bilinearInterpolation(sourceData, image.width, source.x, source.y);
                        const idx = (y * tempCanvas.width + x) * 4;
                        imageData.data[idx] = colors.r;     // R
                        imageData.data[idx + 1] = colors.g; // G
                        imageData.data[idx + 2] = colors.b; // B
                        imageData.data[idx + 3] = colors.a; // A
                    }
                }
            }
        }

        // Put the transformed image data onto the temporary canvas
        tempCtx.putImageData(imageData, 0, 0);

        // Set blend mode before drawing
        const previousBlendMode = this.ctx.globalCompositeOperation;
        this.ctx.globalCompositeOperation = blendMode;

        // Draw the result onto the main canvas
        this.ctx.drawImage(tempCanvas, 
            0, 0, tempCanvas.width, tempCanvas.height,
            bounds.minX, bounds.minY, bounds.width, bounds.height
        );

        // Restore previous blend mode
        this.ctx.globalCompositeOperation = previousBlendMode;
    }

    /**
     * Get sample points for anti-aliasing
     */
    getSamplePoints(x, y, samples) {
        const points = [];
        const step = 1 / samples;
        for (let dy = 0; dy < samples; dy++) {
            for (let dx = 0; dx < samples; dx++) {
                points.push({
                    x: x + dx * step,
                    y: y + dy * step
                });
            }
        }
        return points;
    }

    /**
     * Compute the homography matrix H that maps source points to target points
     */
    computeHomography(source, target) {
        const A = [];
        const b = [];

        // For each point correspondence, add two rows to the equation system
        for (let i = 0; i < 4; i++) {
            const s = source[i];
            const t = target[i];

            A.push([
                s.x, s.y, 1, 0, 0, 0, -s.x * t.x, -s.y * t.x
            ]);
            A.push([
                0, 0, 0, s.x, s.y, 1, -s.x * t.y, -s.y * t.y
            ]);
            b.push(t.x);
            b.push(t.y);
        }

        // Solve the system of equations
        const h = this.solveEquations(A, b);
        return [
            [h[0], h[1], h[2]],
            [h[3], h[4], h[5]],
            [h[6], h[7], 1]
        ];
    }

    /**
     * Invert a 3x3 matrix
     */
    invertMatrix(m) {
        const [[a, b, c], [d, e, f], [g, h, i]] = m;
        const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
        
        return [
            [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
            [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
            [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det]
        ];
    }

    /**
     * Apply homography matrix to a point
     */
    applyHomography(H, x, y) {
        const denominator = H[2][0] * x + H[2][1] * y + H[2][2];
        return {
            x: (H[0][0] * x + H[0][1] * y + H[0][2]) / denominator,
            y: (H[1][0] * x + H[1][1] * y + H[1][2]) / denominator
        };
    }

    /**
     * Perform bilinear interpolation with higher precision
     */
    bilinearInterpolation(sourceData, sourceWidth, x, y) {
        const x1 = Math.floor(x);
        const y1 = Math.floor(y);
        const x2 = Math.ceil(x);
        const y2 = Math.ceil(y);

        const fx = x - x1;
        const fy = y - y1;

        const getPixel = (x, y) => {
            // Clamp coordinates to valid range
            x = Math.max(0, Math.min(sourceWidth - 1, x));
            y = Math.max(0, Math.min((sourceData.length / 4 / sourceWidth) - 1, y));
            
            const idx = (y * sourceWidth + x) * 4;
            return {
                r: sourceData[idx],
                g: sourceData[idx + 1],
                b: sourceData[idx + 2],
                a: sourceData[idx + 3]
            };
        };

        const p11 = getPixel(x1, y1);
        const p21 = getPixel(x2, y1);
        const p12 = getPixel(x1, y2);
        const p22 = getPixel(x2, y2);

        return {
            r: this.bilerp(p11.r, p21.r, p12.r, p22.r, fx, fy),
            g: this.bilerp(p11.g, p21.g, p12.g, p22.g, fx, fy),
            b: this.bilerp(p11.b, p21.b, p12.b, p22.b, fx, fy),
            a: this.bilerp(p11.a, p21.a, p12.a, p22.a, fx, fy)
        };
    }

    /**
     * Helper function for bilinear interpolation
     */
    bilerp(p11, p21, p12, p22, fx, fy) {
        const top = p11 * (1 - fx) + p21 * fx;
        const bottom = p12 * (1 - fx) + p22 * fx;
        return Math.round(top * (1 - fy) + bottom * fy);
    }

    /**
     * Get bounding box of points
     */
    getBoundingBox(points) {
        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);
        const minX = Math.floor(Math.min(...xs));
        const maxX = Math.ceil(Math.max(...xs));
        const minY = Math.floor(Math.min(...ys));
        const maxY = Math.ceil(Math.max(...ys));
        return {
            minX, minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    /**
     * Solve system of linear equations using Gaussian elimination
     */
    solveEquations(A, b) {
        const n = A.length;
        const augmented = A.map((row, i) => [...row, b[i]]);

        // Forward elimination
        for (let i = 0; i < n; i++) {
            let maxRow = i;
            for (let j = i + 1; j < n; j++) {
                if (Math.abs(augmented[j][i]) > Math.abs(augmented[maxRow][i])) {
                    maxRow = j;
                }
            }

            [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

            for (let j = i + 1; j < n; j++) {
                const factor = augmented[j][i] / augmented[i][i];
                for (let k = i; k <= n; k++) {
                    augmented[j][k] -= factor * augmented[i][k];
                }
            }
        }

        // Back substitution
        const solution = new Array(n).fill(0);
        for (let i = n - 1; i >= 0; i--) {
            let sum = augmented[i][n];
            for (let j = i + 1; j < n; j++) {
                sum -= augmented[i][j] * solution[j];
            }
            solution[i] = sum / augmented[i][i];
        }

        return solution;
    }

    calculateInitialCornerPoints(image, canvas) {
        const padding = 50;
        const maxWidth = canvas.width - (padding * 2);
        const maxHeight = canvas.height - (padding * 2);
        
        let width = image.width;
        let height = image.height;
        
        // Scale down if image is too large
        if (width > maxWidth || height > maxHeight) {
            const scale = Math.min(maxWidth / width, maxHeight / height);
            width *= scale;
            height *= scale;
        }
        
        return [
            { x: padding, y: padding }, // Top-left
            { x: padding + width, y: padding }, // Top-right
            { x: padding + width, y: padding + height }, // Bottom-right
            { x: padding, y: padding + height } // Bottom-left
        ];
    }
}

export default ImageTransformer; 