/**
 * @fileoverview Rule to disallow using optional chaining - because this is transpiled into verbose code.
 * @author Francesco Novy
 *
 * Based on https://github.com/facebook/lexical/pull/3233
 */

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow usage of optional chaining',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      forbidden: 'Avoid using optional chaining',
    },
    fixable: null,
    schema: [],
  },

  create(context) {
    const sourceCode = context.getSourceCode();

    /**
     * Checks if the given token is a `?.` token or not.
     * @param {Token} token The token to check.
     * @returns {boolean} `true` if the token is a `?.` token.
     */
    function isQuestionDotToken(token) {
      return (
        token.value === '?.' &&
        (token.type === 'Punctuator' || // espree has been parsed well.
          // espree@7.1.0 doesn't parse "?." tokens well. Therefore, get the string from the source code and check it.
          sourceCode.getText(token) === '?.')
      );
    }

    return {
      'CallExpression[optional=true]'(node) {
        context.report({
          messageId: 'forbidden',
          node: sourceCode.getTokenAfter(node.callee, isQuestionDotToken),
        });
      },
      'MemberExpression[optional=true]'(node) {
        context.report({
          messageId: 'forbidden',
          node: sourceCode.getTokenAfter(node.object, isQuestionDotToken),
        });
      },
    };
  },
};
