import { listingToRoom } from './playroom-mappers';
import { buildSearchableRoomText } from './playroom-search';

// Search includes both ends of a forwarded port, even when their numbers differ.
describe('buildSearchableRoomText', () => {
  it('matches name, owner, image and reported port numbers without case differences', () => {
    const room = listingToRoom(
      {
        Name: 'API-development',
        Owner: 'developer@example.test',
        Image: 'Ubuntu:24',
        Ports: [{ Port: 80, TargetPort: 8080 }],
      },
      'playhouse-platform-dev',
    );
    const text = buildSearchableRoomText(room);
    for (const query of ['api-development', 'developer@example.test', 'ubuntu:24', '80', '8080'])
      expect(text).toContain(query);
    expect(text).not.toContain('9000');
  });

  it('handles rooms without an image or reported ports', () => {
    const text = buildSearchableRoomText(listingToRoom({ Name: 'demo' }, 'playhouse-platform-dev'));
    expect(text).toContain('demo');
    expect(text).not.toContain('undefined');
  });
});
