/**
 * Photos revealed by "uncover the photo" levels, and shown in the Album.
 *
 * Files live in public/photos/{id}.jpg (square, 640px). To add one: drop the
 * file there, add an entry here, and reference its id from a level's `photo`.
 * Ids are part of saved progress (via the level that awards them), so don't
 * rename them once shipped.
 */
export interface PhotoDef {
  id: string;
  /** Caption shown when the photo is revealed and in the album. */
  title: string;
}

export const PHOTOS: PhotoDef[] = [
  { id: 'plaid-hood', title: 'Peekaboo' },
  { id: 'blanket-burrito', title: 'Blanket Burrito' },
  { id: 'walk-tongue', title: 'Walkies' },
  { id: 'red-blanket', title: 'Little Red' },
  { id: 'lick', title: 'Mlem' },
  { id: 'happy-grin', title: 'Cheese!' },
  { id: 'sun-squint', title: 'Sun Worshipper' },
  { id: 'nap', title: 'Sweet Dreams' },
  { id: 'tongue-portrait', title: 'Blep' },
  { id: 'screen-door', title: 'Let Us In' },
];

export const photoUrl = (id: string): string => `./photos/${id}.jpg`;
export const getPhoto = (id: string): PhotoDef | undefined => PHOTOS.find((p) => p.id === id);
