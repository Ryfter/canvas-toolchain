import { describe, it, expect, vi } from 'vitest';
import { updateAssignmentDescription } from '../src/tools/update-assignment-description.js';
import { CanvasApiError } from '../src/canvas-api.js';

describe('updateAssignmentDescription', () => {
  it('calls api.updateAssignmentDescription with courseId, assignmentId, html', async () => {
    const api = { updateAssignmentDescription: vi.fn().mockResolvedValue({ id: 1, name: 'A', description: '<p>x</p>' }) };
    const out = await updateAssignmentDescription(10, 1, '<p>x</p>', api as any);
    expect(api.updateAssignmentDescription).toHaveBeenCalledWith(10, 1, '<p>x</p>');
    expect(out).toEqual({ id: 1, name: 'A', description: '<p>x</p>' });
  });

  it('lets CanvasApiError bubble unchanged', async () => {
    const api = { updateAssignmentDescription: vi.fn().mockRejectedValue(new CanvasApiError(429, 'CANVAS_RATE_LIMITED', 'Canvas is rate limiting requests. Try again in a few minutes.')) };
    await expect(updateAssignmentDescription(10, 1, '<p>x</p>', api as any)).rejects.toBeInstanceOf(CanvasApiError);
  });
});
