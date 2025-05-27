class MockupAnimator {
    /**
     * Animate screen image corners to target positions
     * @param {Array<{x: number, y: number}>} startPoints - Current corner positions
     * @param {Array<{x: number, y: number}>} endPoints - Target corner positions
     * @param {number} duration - Animation duration in milliseconds
     * @param {function} onUpdate - Callback function to update corner positions
     * @returns {Promise} Resolves when animation is complete
     */
    static async animateCorners(startPoints, endPoints, duration = 1000, onUpdate) {
        const startTime = performance.now();
        
        return new Promise((resolve) => {
            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                // Use easeInOutCubic easing function
                const eased = progress < 0.5
                    ? 4 * progress * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 3) / 2;

                // Interpolate between start and end points
                const currentPoints = startPoints.map((start, i) => ({
                    x: start.x + (endPoints[i].x - start.x) * eased,
                    y: start.y + (endPoints[i].y - start.y) * eased
                }));

                // Call update function with current points
                onUpdate(currentPoints);

                // Continue animation if not complete
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    resolve();
                }
            };

            requestAnimationFrame(animate);
        });
    }
}

export default MockupAnimator; 