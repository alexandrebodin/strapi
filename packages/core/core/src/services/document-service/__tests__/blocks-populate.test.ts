import {
  populateBlocksValue,
  findBlocksAttributeNames,
  validateBlocksRefsForPublish,
} from '../blocks/populate';

/**
 * The shared Jest setup (`tests/setup/unit.setup.js`) defines `global.strapi`
 * via a setter that derives helper methods from `plugins` and `api`. Honour
 * that contract by always including empty `plugins` and `api` so the setter's
 * bookkeeping doesn't blow up on our minimal mock.
 */
const setStrapi = (value: Record<string, unknown>) => {
  (global as any).strapi = {
    plugins: {},
    api: {},
    ...value,
  };
};

const clearStrapi = () => {
  (global as any).strapi = { plugins: {}, api: {} };
};

describe('blocks/populate', () => {
  afterEach(() => {
    clearStrapi();
  });

  describe('findBlocksAttributeNames', () => {
    it('returns every attribute of type blocks', () => {
      const schema = {
        attributes: {
          title: { type: 'string' },
          body: { type: 'blocks' },
          hero: { type: 'blocks' },
          meta: { type: 'json' },
        },
      } as any;
      expect(findBlocksAttributeNames(schema)).toEqual(['body', 'hero']);
    });

    it('returns [] when there are no blocks attributes', () => {
      expect(findBlocksAttributeNames({ attributes: { t: { type: 'string' } } } as any)).toEqual(
        []
      );
    });
  });

  describe('populateBlocksValue', () => {
    it('returns the value unchanged when it is not an array', async () => {
      await expect(populateBlocksValue(null, { status: 'draft' })).resolves.toBe(null);
      await expect(populateBlocksValue(undefined, { status: 'draft' })).resolves.toBe(undefined);
      await expect(populateBlocksValue('lol' as any, { status: 'draft' })).resolves.toBe('lol');
    });

    it('normalises a legacy image node into a media node at read time', async () => {
      const image = { name: 'x.png', url: '/u/x.png' };
      const value = [{ type: 'image', image, children: [{ type: 'text', text: '' }] }];
      const out = (await populateBlocksValue(value, { status: 'draft' })) as any[];
      expect(out[0]).toMatchObject({ type: 'media', kind: 'image', media: image });
    });

    it('resolves a relation node against the status and locale', async () => {
      const findOne = jest.fn().mockResolvedValue({ id: 42, title: 'hi' });
      setStrapi({ db: { query: jest.fn().mockReturnValue({ findOne }) } });

      const nodes = [
        {
          type: 'relation',
          target: 'api::article.article',
          documentId: 'doc123',
          locale: 'en',
          children: [{ type: 'text', text: '' }],
        },
      ];

      const out = (await populateBlocksValue(nodes, { status: 'published' })) as any[];
      expect(out[0].resolved).toEqual({ id: 42, title: 'hi' });
      expect(findOne).toHaveBeenCalledWith({
        where: {
          documentId: 'doc123',
          locale: 'en',
          publishedAt: { $notNull: true },
        },
      });
    });

    it('marks a relation as missing when the target is not found', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      setStrapi({ db: { query: jest.fn().mockReturnValue({ findOne }) } });

      const nodes = [
        {
          type: 'relation',
          target: 'api::article.article',
          documentId: 'missing',
          children: [{ type: 'text', text: '' }],
        },
      ];

      const out = (await populateBlocksValue(nodes, { status: 'draft' })) as any[];
      expect(out[0].resolved).toEqual({ missing: true });
    });

    it('recurses into children', async () => {
      const value = [
        {
          type: 'paragraph',
          children: [{ type: 'text', text: 'hello' }],
        },
      ];
      const out = (await populateBlocksValue(value, { status: 'draft' })) as any[];
      expect(out[0].children).toEqual([{ type: 'text', text: 'hello' }]);
    });
  });

  describe('validateBlocksRefsForPublish', () => {
    const schema = {
      attributes: {
        body: { type: 'blocks' },
      },
    } as any;

    it('is a no-op when policy is ignore', async () => {
      const queryMock = jest.fn();
      setStrapi({
        config: { get: () => 'ignore' },
        db: { query: queryMock },
      });
      await expect(validateBlocksRefsForPublish({ body: [] }, schema)).resolves.toBeUndefined();
      expect(queryMock).not.toHaveBeenCalled();
    });

    it('throws a ValidationError listing every unpublished target in strict mode', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      setStrapi({
        config: { get: () => 'strict' },
        db: { query: jest.fn().mockReturnValue({ findOne }) },
      });
      const entry = {
        body: [
          {
            type: 'relation',
            target: 'api::article.article',
            documentId: 'a',
            children: [{ type: 'text', text: '' }],
          },
          {
            type: 'relation',
            target: 'api::article.article',
            documentId: 'b',
            locale: 'fr',
            children: [{ type: 'text', text: '' }],
          },
        ],
      };
      await expect(validateBlocksRefsForPublish(entry, schema)).rejects.toThrow(
        /api::article\.article#a.*api::article\.article#b@fr/
      );
    });

    it('succeeds when every target has a published version', async () => {
      const findOne = jest.fn().mockResolvedValue({ id: 1 });
      setStrapi({
        config: { get: () => 'strict' },
        db: { query: jest.fn().mockReturnValue({ findOne }) },
      });
      const entry = {
        body: [
          {
            type: 'relation',
            target: 'api::article.article',
            documentId: 'a',
            children: [{ type: 'text', text: '' }],
          },
        ],
      };
      await expect(validateBlocksRefsForPublish(entry, schema)).resolves.toBeUndefined();
    });

    it('warns instead of throwing when policy is warn', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const warn = jest.fn();
      setStrapi({
        config: { get: () => 'warn' },
        db: { query: jest.fn().mockReturnValue({ findOne }) },
        log: { warn },
      });
      const entry = {
        body: [
          {
            type: 'relation',
            target: 'api::article.article',
            documentId: 'a',
            children: [{ type: 'text', text: '' }],
          },
        ],
      };
      await expect(validateBlocksRefsForPublish(entry, schema)).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('api::article.article#a'));
    });
  });
});
