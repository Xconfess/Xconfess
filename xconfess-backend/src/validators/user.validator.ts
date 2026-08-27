import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';

export const updateProfileValidator = [
  body('isAnonymous')
    .optional()
    .isBoolean()
    .withMessage('isAnonymous must be boolean'),
];

export const updateProfileController = (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // profile update logic here
  res.json({ message: 'Profile updated!' });
};
