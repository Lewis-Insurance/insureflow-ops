/**
 * Flags deprecated domain terms in identifiers (not string literals).
 * Allowed in UI copy (strings/JSX text) but disallowed in variable, function, file names.
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow deprecated domain terms in identifiers',
      category: 'Best Practices',
      recommended: true
    },
    schema: []
  },
  create(context) {
    const banned = /^(insured|insuree|profile|company|business|client)s?$/i;

    function checkName(name, node) {
      if (banned.test(name)) {
        context.report({
          node,
          message: `Use canonical terms (Account, Contact, Policy...). Found deprecated term: "${name}"`
        });
      }
    }

    return {
      Identifier(node) {
        // Skip if this identifier is in a string literal or JSX text
        const parent = node.parent;
        if (parent && (
          parent.type === 'Literal' ||
          parent.type === 'JSXText' ||
          parent.type === 'TemplateElement'
        )) {
          return;
        }
        checkName(node.name, node);
      },

      // Check filenames via Program node
      Program(node) {
        const fname = context.getFilename();
        const base = fname.split('/').pop() || '';
        const stem = base.replace(/\.[^.]+$/, '');
        if (banned.test(stem)) {
          context.report({
            node,
            message: `Rename file to avoid deprecated domain term: ${base}`
          });
        }
      }
    };
  }
};
