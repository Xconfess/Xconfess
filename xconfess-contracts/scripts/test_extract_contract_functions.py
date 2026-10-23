import unittest

from extract_contract_functions import contract_functions


class ContractFunctionsTest(unittest.TestCase):
    def test_only_exported_contract_methods_are_abi(self):
        source = '''
impl Error { pub fn message() {} }
// #[contractimpl] impl Fake { pub fn injected() {} }
/* outer /* nested */ #[contractimpl] impl Fake { pub fn hidden() {} } */
#[contractimpl]
impl Contract {
    pub fn exported() {
        let text = "} pub fn fake() {";
        let raw = r#"} pub fn fake_raw() {"#;
        fn helper() {}
    }
    fn private() {}
}
#[contractimpl]
impl Other { pub fn second() {} }
'''
        self.assertEqual(contract_functions(source), ['exported', 'second'])

    def test_unterminated_block_fails(self):
        with self.assertRaises(ValueError):
            contract_functions('#[contractimpl] impl Contract { pub fn exported() {}')


if __name__ == '__main__':
    unittest.main()
