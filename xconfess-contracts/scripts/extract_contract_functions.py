"""Extract direct public methods from Soroban contractimpl blocks, without execution."""

import pathlib
import re
import sys


def contract_functions(source):
    # Mask literals and comments before balancing braces. Nested block comments
    # are legal Rust; a single comment regex would expose their contents.
    tokens = re.compile(r'//[^\n]*|/\*|"(?:\\.|[^"\\])*"|r(#+)?"')
    cursor = 0
    masked = []
    while match := tokens.search(source, cursor):
        masked.append(source[cursor:match.start()])
        end = match.end()
        if match.group() == '/*':
            depth = 1
            while depth:
                delimiter = re.search(r'/\*|\*/', source[end:])
                if delimiter is None:
                    raise ValueError('Unterminated Rust block comment')
                depth += 1 if delimiter.group() == '/*' else -1
                end += delimiter.end()
        elif match.group().startswith('r'):
            closing = '"' + (match.group(1) or '')
            finish = source.find(closing, end)
            if finish < 0:
                raise ValueError('Unterminated Rust raw string')
            end = finish + len(closing)
        masked.append(' ' * (end - match.start()))
        cursor = end
    masked.append(source[cursor:])
    code = ''.join(masked)
    functions = set()
    for block in re.finditer(r'#\[\s*contractimpl\s*\]\s*impl\b[^\{]*\{', code):
        depth = 1
        for token in re.finditer(r'[{}]|\bpub\s+fn\s+([a-z_][a-z_0-9]*)', code[block.end():]):
            if token.group() == '{':
                depth += 1
            elif token.group() == '}':
                depth -= 1
                if depth == 0:
                    break
            elif depth == 1:
                functions.add(token.group(1))
        if depth:
            raise ValueError('Unterminated contractimpl block')
    return sorted(functions)


if __name__ == '__main__':
    print('\n'.join(contract_functions(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))))
