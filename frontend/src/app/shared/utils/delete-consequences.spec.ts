import { listDeleteConsequences } from './delete-consequences';

describe('listDeleteConsequences', () => {
  it('lists the home folder with its reported size and persistent storage', () => {
    expect(listDeleteConsequences({ disk: '20Gi', diskType: 'persistent' })).toEqual([
      'The home folder /home/playroom (20Gi) and everything in it',
      'Its persistent storage, which cannot be recovered',
    ]);
  });

  it('says when the storage is ephemeral', () => {
    expect(listDeleteConsequences({ disk: '10Gi', diskType: 'ephemeral' })).toEqual([
      'The home folder /home/playroom (10Gi) and everything in it',
      'Its ephemeral storage, which a restart wipes anyway',
    ]);
  });

  it('leaves out the size when the room does not report one', () => {
    expect(listDeleteConsequences({ disk: '', diskType: 'ephemeral' })[0]).toBe(
      'The home folder /home/playroom and everything in it',
    );
  });

  it('leaves out the storage line for a storage type it does not know', () => {
    expect(listDeleteConsequences({ disk: '20Gi', diskType: '' })).toEqual([
      'The home folder /home/playroom (20Gi) and everything in it',
    ]);
    expect(listDeleteConsequences({ disk: '20Gi', diskType: 'network' })).toHaveLength(1);
  });
});
