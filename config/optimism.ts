interface OptimismBridgeConfig {
  [network: string]: {
    bridges: { [token: string]: string } // Bridge address for tokens,
    tokens?: { [l1Token: string]: string } // Token address on L2 for token on L1,
    snxToken: string // SNX token address
  }
}

// The reference for Token list and bridges
// https://github.com/ethereum-optimism/ethereum-optimism.github.io/blob/master/optimism.tokenlist.json

const TOKENS = {
  mainnet: [
    {
      assetId: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
      bridge: '0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4'
    }, // SNX
    {
      assetId: '0x6b175474e89094c44da98b954eedeac495271d0f',
      bridge:
        '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', // DAI
    },
    {
      assetId: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      bridge: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58'
    }, // USDT
    { assetId: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
    bridge: '0x68f180fcCe6836688e9084f035309E29Bf0A2095'
    }, // WBTC
    {
      assetId: '0xb6ed7644c69416d67b522e20bc294a9a9b405b31',
      bridge: '0xe0BB0D3DE8c10976511e5030cA403dBf4c25165B'
    }, // 0xBTC
    {
      assetId: '0x514910771af9ca656af840dff83e8264ecf986ca',
      bridge: '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6'
    }, // LINK
    {
      assetId: '0xc18360217d8f7ab5e7c516566761ea12ce7f9d72',
      bridge: '0x65559aA14915a70190438eF90104769e5E890A00'
    }, // ENS
    {
      assetId: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      bridge: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607'
    }, // USDC
    {
      assetId: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      bridge: '0x6fd9d7AD17242c41f7131d257212c54A0e816691'
    }, // UNI
    {
      assetId: '0x5f98805a4e8be255a32880fdec7f6728c6568ba0',
      bridge: '0xc40F949F8a4e094D1b49a23ea9241D289B7b2819'
    }, // LUSD
    {
      assetId: '0xd291e7a03283640fdc51b121ac401383a46cc623',
      bridge: '0xB548f63D4405466B36C0c0aC3318a22fDcec711a'
    }, // RGT
    {
      assetId: '0x03ab458634910aad20ef5f1c8ee96f1d6ac54919',
      bridge: '0x7FB688CCf682d58f86D7e38e03f9D22e7705448B'
    }, // RAI
    {
      assetId: '0xae78736cd615f374d3085123a210448e74fc6393',
      bridge: '0x9Bcef72be871e61ED4fBbc7630889beE758eb81D'
    }, // rETH
    {
      assetId: '0x7ae1d57b58fa6411f32948314badd83583ee0e8c',
      bridge: '0x00F932F0FE257456b32dedA4758922E56A4F4b42'
    }, // PAPER
    {
      assetId: '0x7697b462a7c4ff5f8b55bdbc2f4076c2af9cf51a',
      bridge: '0x7c6b91D9Be155A6Db01f749217d76fF02A7227F2'
    }, // SARCO
    {
      assetId: '0x15ee120fd69bec86c1d38502299af7366a41d1a6',
      bridge: '0x5029C236320b8f15eF0a657054B84d90bfBEDED3'
    }, // BitANT
    {
      assetId: '0x3c513db8bdc3806e4489d62c3d549a5aaf6a4e97',
      bridge: '0xc98B98d17435AA00830c87eA02474C5007E1f272'
    }, // BitBTC
    {
      assetId: '0x01ba67aac7f75f647d94220cc98fb30fcc5105bf',
      bridge: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb'
    }, // LYRA
    {
      assetId: '0x04fa0d235c4abf4bcf4787af4cf447de572ef828',
      bridge: '0xE7798f023fC62146e8Aa1b36Da45fb70855a77Ea'
    }, // UMA
    {
      assetId: '0xbc396689893d065f41bc2c6ecbee5e0085233447',
      bridge: '0x9e1028F5F1D5eDE59748FFceE5532509976840E0'
    }, // PERP
    {
      assetId: '0x431ad2ff6a9c365805ebad47ee021148d6f7dbe0',
      bridge: '0x9e5AAC1Ba1a2e6aEd6b32689DFcF62A509Ca96f3'
    }, // DF
    {
      assetId: '0x0a5e677a6a24b2f1a2bf4f3bffc443231d2fdec8',
      bridge: '0xbfD291DA8A403DAAF7e5E9DC1ec0aCEaCd4848B9'
    }, // USX
    {
      assetId: '0x0391d2021f89dc339f60fff84546ea23e337750f',
      bridge: '0x3e7eF8f50246f725885102E8238CBba33F276747'
    }, // BOND
    {
      assetId: '0x259ab9b9eab62b0fd98729b97be121073d5b3479',
      bridge: '0x7b0bcC23851bBF7601efC9E9FE532Bf5284F65d3'
    }, // EST
    {
      assetId: '0x08d32b0da63e2c3bcf8019c9c5d849d7a9d791e6',
      bridge: '0x1da650c3b2daa8aa9ff6f661d4156ce24d08a062'
    }, // DCN
    {
      assetId: '0x3af33bef05c2dcb3c7288b77fe1c8d2aeba4d789',
      bridge: '0xf98dcd95217e15e05d8638da4c91125e59590b07'
    }, // KROM
    {
      assetId: '0xca1207647ff814039530d7d35df0e1dd2e91fa84',
      bridge: '0xAF9fE3B5cCDAe78188B1F8b9a49Da7ae9510F151'
    }, // DHT
    {
      assetId: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2',
      bridge: '0xab7badef82e9fe11f6f33f87bc9bc2aa27f2fcb5'
    }, // MKR
    {
      assetId: '0x102e941b77bcaa7e35d368cafe51ef8f79c8d1ef',
      bridge: '0x3bB4445D30AC020a84c1b5A8A2C6248ebC9779D0'
    }, // LIZ
    {
      assetId: '0x69af81e73a73b40adf4f3d4223cd9b1ece623074',
      bridge: '0x3390108E913824B8eaD638444cc52B9aBdF63798'
    }, // MASK
    {
      assetId: '0xd533a949740bb3306d119cc777fa900ba034cd52',
      bridge: '0x0994206dfe8de6ec6920ff4d779b0d950605fb53'
    }, // CRV
    {
      assetId: '0x42d6622dece394b54999fbd73d108123806f6a18',
      bridge: '0xcfD1D50ce23C46D3Cf6407487B2F8934e96DC8f9'
    }, // SPANK
    {
      assetId: '0xbbbbca6a901c926f240b89eacb641d8aec7aeafd',
      bridge: '0xFEaA9194F9F8c1B65429E31341a103071464907E'
    }, // LRC
    {
      assetId: '0x8947da500eb47f82df21143d0c01a29862a8c3c5',
      bridge: '0x217D47011b23BB961eB6D93cA9945B7501a5BB11'
    }, // THALES
    {
      assetId: '0xa693b19d2931d498c5b318df961919bb4aee87a5',
      bridge: '0xBA28feb4b6A6b81e3F26F08b83a19E715C4294fd'
    }, // UST
    {
      assetId: '0xb4272071ecadd69d933adcd19ca99fe80664fc08',
      bridge: '0xE4F27b04cC7729901876B44f4EAA5102EC150265'
    }, // XCHF
    {
      assetId: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
      bridge: '0x76FB31fb4af56892A25e32cFC43De717950c9278'
    }, // AAVE
    {
      assetId: '0x1da87b114f35e1dc91f72bf57fc07a768ad40bb0',
      bridge: '0x81ab7e0d570b01411fcc4afd3d50ec8c241cb74b'
    }, // EQZ
    {
      assetId: '0xbea98c05eeae2f3bc8c3565db7551eb738c8ccab',
      bridge: '0x117cFd9060525452db4A34d51c0b3b7599087f05'
    }, // GYSR
    {
      assetId: '0xba100000625a3754423978a60c9317c58a424e3d',
      bridge: '0xFE8B128bA8C78aabC59d4c64cEE7fF28e9379921'
    }, // BAL
    {
      assetId: '0xde30da39c46104798bb5aa3fe8b9e0e1f348163f',
      bridge: '0x1eba7a6a72c894026cd654ac5cdcf83a46445b08'
    }, // GTC
    {
      assetId: '0x865377367054516e17014ccded1e7d814edc9ce4',
      bridge: '0x8aE125E8653821E851F12A49F7765db9a9ce7384'
    }, // DOLA
    {
      assetId: '0xbb9bc244d798123fde783fcc1c72d3bb8c189413',
      bridge: '0xd8f365c2c85648f9b89d9f1bf72c0ae4b1c36cfd'
    }, // TheDAO
    ]
  },
  kovan: {
    '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f':
      '0x0064a673267696049938aa47595dd0b3c2e705a1', // SNX
    '0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa':
      '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', // DAI
    '0xe0bb0d3de8c10976511e5030ca403dbf4c25165b':
      '0x7f5c764cbc14f9669b88837ca1490cca17c31607', // USDT
    '0x68f180fcce6836688e9084f035309e29bf0a2095':
      '0x2382a8f65b9120e554d1836a504808ac864e169d', // WBTC
    '0x24a19ee5a5c8757acdebe542a9436d9c796d1c9e':
      '0x56b4f5f44d348ec3f07bf1f31a3b566e5304bede', // 0xBTC
    '0xa36085f69e2889c224210f603d836748e7dc0088':
      '0x4911b761993b9c8c0d14ba2d86902af6b0074f5b', // LINK
    '0x50eb44e3a68f1963278b4c74c6c343508d31704c':
      '0x65e44970ebfe42f98f83c4b67062de94b9f3da7d', // EURT
    '0x50dc5200082d37d5dd34b4b0691f36e3632fe1a8':
      '0x4e62882864fb8ce54affcaf8d899a286762b011b', // USDC
    '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984':
      '0x5e31b81eafba4b9371e77f34d6f3da8091c3f2a0', // UNI
    '0x76b06a2f6df6f0514e7bec52a9afb3f603b477cd':
      '0x743224e4822710a3e40d754244f3e0f1db2e5d8f', // RAI
    '0x3ef0aba205134ba2f449fa04a0a0673020c36270':
      '0x1f748732af4442cf508def0882ad9fcb5e5205a2', // BitANT
    '0xf6dd2a9b840826d53c9842207628502b79e6b8c2':
      '0x83643c9ef0c5707a7815124754d0828c9a38be3a', // BitBTC
    '0x002be8a5961e0f352092d6693133a6944b7846ba':
      '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', // PERP
    '0x521ee0cedbed2a5a130b9218551fe492c5c402e4':
      '0x9e5aac1ba1a2e6aed6b32689dfcf62a509ca96f3', // BOND
    '0x79e40d67da6eae5eb4a93fc6a56a7961625e15f3':
      '0x3e7ef8f50246f725885102e8238cbba33f276747', // DF
    '0xf76ead4da04bbeb97d29f83e2ec3a621d0fb3c6e':
      '0xab7020476d814c52629ff2e4cebc7a8cdc04f18e', // USX
    '0x001dedc8c67ef6d1f4bb66fb28581d466650cd76':
      '0xfd6ab60e0744e95c35fb17afda478eeae3835ddf', // DCN
    '0x0436f489525c47c1a4877a06be0beaba2a2e2e2d':
      '0x9e1028f5f1d5ede59748ffcee5532509976840e0', // KROM
    '0x47aa2a683b88e23c4d76f91aa4181a59d0e4fbfb':
      '0x3bb4445d30ac020a84c1b5a8a2c6248ebc9779d0', // LIZ
    '0x2ea8f9b29ac1d70e01ae9d23d0451d2242e8d609':
      '0xcfd1d50ce23c46d3cf6407487b2f8934e96dc8f9', // SPANK
    '0x9be876c6dc42215b00d7efe892e2691c3bc35d10':
      '0x76fb31fb4af56892a25e32cfc43de717950c9278', // AAVE
    '0xea281a04cf517aa0d4645bdda0353b0958e4b1b4':
      '0x8ee73c484a26e0a5df2ee2a4960b789967dd0415', // EQZ
    '0xda9b55de6e04404f6c77673d4b243142a4efc6b8':
      '0x197d38dc562dfb2490ec1a1d5c4cc4319d178bb4', // GYSR
    '0x41286bb1d3e870f3f750eb7e1c25d7e48c8a1ac7':
      '0xc72751efd79b153d5bdc7e1a43b4b98aa2aa04c7', // BAL
    '0xb7e230f904971724c600ad5217b88d219ddd1525':
      '0xaf8ca653fa2772d58f4368b0a71980e9e3ceb888', // GTC
    '0x39445dec9ba7fb3776e8e5f9922864ddb9089304':
      '0x0d760ee479401bb4c40bdb7604b329fff411b3f2', // DOLA
    '0x8274ea38fe9bea66f8e7c6f3ef742b85d86aeb5d':
      '0x35597dc6f8fdc81d71b311a9e4e2710ef6accb68', // TheDAO
  },
}

const BRIDGES = {
  mainnet: {
    '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f':
      '0x39Ea01a0298C315d149a490E34B59Dbf2EC7e48F',
    '0x6b175474e89094c44da98b954eedeac495271d0f':
      '0x10E6593CDda8c58a1d0f14C5164B376352a55f2F',
    '0x3c513db8bdc3806e4489d62c3d549a5aaf6a4e97':
      '0xaBA2c5F108F7E820C049D5Af70B16ac266c8f128',
    '0x0a5e677a6a24b2f1a2bf4f3bffc443231d2fdec8':
      '0xC5b1EC605738eF73a4EFc562274c1c0b6609cF59',
    standardBridge: '0x99C9fc46f92E8a1c0deC1b1747d010903E884bE1',
  },
  kovan: {
    '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f':
      '0xc00E7C2Bd7B0Fb95DbBF10d2d336399A939099ee',
    '0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa':
      '0xb415e822C4983ecD6B1c1596e8a5f976cf6CD9e3',
    '0xf6dd2a9b840826d53c9842207628502b79e6b8c2':
      '0x0b651A42F32069d62d5ECf4f2a7e5Bd3E9438746',
    '0xf76ead4da04bbeb97d29f83e2ec3a621d0fb3c6e':
      '0x40E862341b2416345F02c41Ac70df08525150dC7',
    standardBridge: '0x22F24361D548e5FaAfb36d1437839f080363982B',
  },
  optimism: {
    '0x8700daec35af8ff88c16bdf0418774cb3d7599b4':
      '0x136b1EC699c62b0606854056f02dC7Bb80482d63',
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1':
      '0x467194771dAe2967Aef3ECbEDD3Bf9a310C76C65',
    '0xc98b98d17435aa00830c87ea02474c5007e1f272':
      '0x158F513096923fF2d3aab2BcF4478536de6725e2',
    '0xbfd291da8a403daaf7e5e9dc1ec0aceacd4848b9':
      '0xc76cbFbAfD41761279E3EDb23Fd831Ccb74D5D67',
    standardBridge: '0x4200000000000000000000000000000000000010',
  },
  optimism_kovan: {
    '0x0064a673267696049938aa47595dd0b3c2e705a1':
      '0x5b643DFC67f9701929A0b55f23e0Af61df50E75D',
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1':
      '0x467194771dAe2967Aef3ECbEDD3Bf9a310C76C65',
    '0x83643c9ef0c5707a7815124754d0828c9a38be3a':
      '0x0CFb46528a7002a7D8877a5F7a69b9AaF1A9058e',
    '0xab7020476d814c52629ff2e4cebc7a8cdc04f18e':
      '0xB4d37826b14Cd3CB7257A2A5094507d701fe715f',
    standardBridge: '0x4200000000000000000000000000000000000010',
  },
}

const config: OptimismBridgeConfig = {
  hardhat: {
    bridges: BRIDGES.mainnet,
    tokens: TOKENS.mainnet,
    snxToken: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
  },
  mainnet: {
    bridges: BRIDGES.mainnet,
    tokens: TOKENS.mainnet,
    snxToken: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
  },
  kovan: {
    bridges: BRIDGES.kovan,
    tokens: TOKENS.kovan,
    snxToken: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
  },
  optimism: {
    bridges: BRIDGES.optimism,
    snxToken: '0x8700daec35af8ff88c16bdf0418774cb3d7599b4',
  },
  optimism_kovan: {
    bridges: BRIDGES.optimism_kovan,
    snxToken: '0x0064A673267696049938AA47595dD0B3C2e705A1',
  },
}

export default config
