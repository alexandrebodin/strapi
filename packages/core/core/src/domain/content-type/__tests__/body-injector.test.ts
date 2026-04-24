import { createContentType } from '../index';

/**
 * Build a minimal `strapi` global for these tests. `config.get(key, fallback)`
 * reads from a shallow map — callers only need to seed the keys their test
 * touches. `hasFirstPublishedAtField` calls `config.get` during
 * `createContentType`, so every test gets a config stub by default.
 */
const setStrapi = (configOverrides: Record<string, unknown> = {}) => {
  const configMap: Record<string, unknown> = { ...configOverrides };
  (global as any).strapi = {
    plugins: {},
    api: {},
    log: { warn: jest.fn() },
    config: {
      get: (key: string, fallback: unknown) => (key in configMap ? configMap[key] : fallback),
    },
  };
};

const buildDefinition = (options: Record<string, unknown> = {}) => ({
  schema: {
    info: {
      singularName: 'article',
      pluralName: 'articles',
      displayName: 'Article',
    },
    kind: 'collectionType' as const,
    collectionName: 'articles',
    attributes: {
      title: { type: 'string' },
    } as Record<string, unknown>,
    options,
  },
  actions: {},
  lifecycles: {},
});

describe('domain/content-type: body injector', () => {
  afterEach(() => {
    (global as any).strapi = { plugins: {}, api: {} };
  });

  it('does not inject body when the future.body flag is disabled', () => {
    setStrapi();
    const schema = createContentType('api::article.article', buildDefinition() as any);
    expect((schema.attributes as Record<string, unknown>).body).toBeUndefined();
  });

  it('injects a blocks body when the flag is enabled and the type has not opted out', () => {
    setStrapi({ 'features.future.body': true });
    const schema = createContentType('api::article.article', buildDefinition() as any);
    expect((schema.attributes as Record<string, unknown>).body).toMatchObject({
      type: 'blocks',
      configurable: false,
      writable: true,
      visible: true,
    });
  });

  it('mirrors allow* toggles into pluginOptions.body', () => {
    setStrapi({ 'features.future.body': true });
    const schema = createContentType(
      'api::article.article',
      buildDefinition({
        body: {
          enabled: true,
          allowComponents: false,
          allowDynamicZones: true,
          allowRelations: false,
        },
      }) as any
    );
    expect(
      (schema.attributes.body as { pluginOptions?: { body?: Record<string, boolean> } })
        ?.pluginOptions?.body
    ).toEqual({
      allowComponents: false,
      allowDynamicZones: true,
      allowRelations: false,
    });
  });

  it('skips injection when options.body.enabled is false', () => {
    setStrapi({ 'features.future.body': true });
    const schema = createContentType(
      'api::article.article',
      buildDefinition({ body: { enabled: false } }) as any
    );
    expect((schema.attributes as Record<string, unknown>).body).toBeUndefined();
  });

  it('defaults all allow* toggles to true when options.body is empty', () => {
    setStrapi({ 'features.future.body': true });
    const schema = createContentType('api::article.article', buildDefinition() as any);
    expect(
      (schema.attributes.body as { pluginOptions?: { body?: Record<string, boolean> } })
        ?.pluginOptions?.body
    ).toEqual({
      allowComponents: true,
      allowDynamicZones: true,
      allowRelations: true,
    });
  });

  it('skips admin:: internal content types', () => {
    setStrapi({ 'features.future.body': true });
    const schema = createContentType('admin::permission', buildDefinition() as any);
    expect((schema.attributes as Record<string, unknown>).body).toBeUndefined();
  });

  it('skips strapi:: internal content types', () => {
    setStrapi({ 'features.future.body': true });
    const schema = createContentType('strapi::core-store', buildDefinition() as any);
    expect((schema.attributes as Record<string, unknown>).body).toBeUndefined();
  });

  it('skips plugin:: content types by default', () => {
    setStrapi({ 'features.future.body': true });
    const schema = createContentType('plugin::users-permissions.user', buildDefinition() as any);
    expect((schema.attributes as Record<string, unknown>).body).toBeUndefined();
  });

  it('injects into plugin:: content types when body.enabled is explicitly true', () => {
    setStrapi({ 'features.future.body': true });
    const schema = createContentType(
      'plugin::my-plugin.article',
      buildDefinition({ body: { enabled: true } }) as any
    );
    expect((schema.attributes as Record<string, unknown>).body).toBeDefined();
  });
});
