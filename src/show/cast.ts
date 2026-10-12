import type { Contestant, Look } from './types';

/**
 * Five stand-ins for the demo. In the app every one of them is a real player:
 * their profile comes from the database and their picture is their camera.
 * Nothing here says where anybody lives — the app has no places on purpose.
 */
export const CAST: Contestant[] = [
  {
    id: 'lena',
    name: 'Lena',
    age: 27,
    persona: 'Romantic',
    vibes: ['Kaffee', 'Reisen', 'Live-Musik'],
    bio: 'Ich lache zu laut und tanze zu schlecht – beides mit voller Überzeugung.',
    color: '#FF3D8B',
    look: { skin: '#E9B99A', hair: '#2A1712', hairStyle: 'wavy', top: '#F3E7DD', light: ['#FFE4EE', '#FF9EC2'] },
  },
  {
    id: 'noah',
    name: 'Noah',
    age: 29,
    persona: 'Wildcard',
    vibes: ['Roadtrips', 'Kochen', 'Fitness'],
    bio: 'Spontan ist mein zweiter Vorname. Der erste ist Noah.',
    color: '#FF8A4C',
    look: { skin: '#C98E6B', hair: '#1E1410', hairStyle: 'short', top: '#2E3A52', light: ['#FFE6D2', '#FFB27A'], beard: true },
  },
  {
    id: 'mara',
    name: 'Mara',
    age: 25,
    persona: 'Showstopper',
    vibes: ['Tanzen', 'Kunst', 'Mode'],
    bio: 'Wer mich zum Lachen bringt, hat schon halb gewonnen.',
    color: '#A97BFF',
    look: { skin: '#8E5B3E', hair: '#140C09', hairStyle: 'curly', top: '#E0457B', light: ['#EDE2FF', '#B794FF'] },
  },
  {
    id: 'elias',
    name: 'Elias',
    age: 31,
    persona: 'Secret Fan',
    vibes: ['Bücher', 'Wandern', 'Jazz'],
    bio: 'Ruhig auf den ersten Blick. Abenteurer auf den zweiten.',
    color: '#2FC7A8',
    look: { skin: '#F0C7A8', hair: '#6B4A2E', hairStyle: 'swept', top: '#1F2A2A', light: ['#DFF8F1', '#7FE3CC'] },
  },
  {
    id: 'sofia',
    name: 'Sofia',
    age: 26,
    persona: 'Romantic',
    vibes: ['Yoga', 'Filme', 'Hunde'],
    bio: 'Sonntags Brunch, montags Motivation. Meistens jedenfalls.',
    color: '#FFC23D',
    look: { skin: '#F2CBB0', hair: '#C99A55', hairStyle: 'long', top: '#FFFFFF', light: ['#FFF4D6', '#FFD37A'] },
  },
];

/** The host in the demo: you. */
export const DEMO_HOST = { id: 'host', name: 'Du' };

/** How the host is drawn while there is no camera. */
export const HOST_LOOK: Look = {
  skin: '#E7B596',
  hair: '#24160F',
  hairStyle: 'swept',
  top: '#16101A',
  light: ['#FFE0EC', '#FF5C9C'],
};

/** Colours handed out to real players, by seat. */
export const SEAT_COLORS = ['#FF3D8B', '#FF8A4C', '#A97BFF', '#2FC7A8', '#FFC23D', '#4FA8FF'];

/** Stand-in looks for real players whose camera has not come up yet. */
export const SEAT_LOOKS: Look[] = CAST.map((one) => one.look);
