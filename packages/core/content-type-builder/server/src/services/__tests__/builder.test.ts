import { isReservedAttributeName } from '../builder';

const setStrapi = (value: Record<string, unknown>) => {
  (global as any).strapi = {
    plugins: {},
    api: {},
    ...value,
  };
};

describe('isReservedAttributeName', () => {
  afterEach(() => {
    (global as any).strapi = { plugins: {}, api: {} };
  });

  it('rejects always-reserved names like id, document_id, created_at', () => {
    expect(isReservedAttributeName('id')).toBe(true);
    expect(isReservedAttributeName('documentId')).toBe(true); // snake_case: document_id
    expect(isReservedAttributeName('createdAt')).toBe(true);
  });

  it('rejects strapi* prefixed names', () => {
    expect(isReservedAttributeName('strapiCustom')).toBe(true);
    expect(isReservedAttributeName('__strapiInternal')).toBe(true);
  });

  it('permits arbitrary user names', () => {
    expect(isReservedAttributeName('title')).toBe(false);
    expect(isReservedAttributeName('myField')).toBe(false);
  });

  describe('flag-gated body reservation', () => {
    it('does not reserve body when the future.body flag is off', () => {
      setStrapi({ features: { future: { isEnabled: () => false } } });
      expect(isReservedAttributeName('body')).toBe(false);
    });

    it('reserves body when the future.body flag is on', () => {
      setStrapi({
        features: { future: { isEnabled: (flag: string) => flag === 'body' } },
      });
      expect(isReservedAttributeName('body')).toBe(true);
    });

    it('does not reserve body when strapi is absent (boot-time safety)', () => {
      (global as any).strapi = { plugins: {}, api: {} };
      expect(isReservedAttributeName('body')).toBe(false);
    });
  });
});
