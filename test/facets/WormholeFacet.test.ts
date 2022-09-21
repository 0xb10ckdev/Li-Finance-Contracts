/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  IERC20 as ERC20,
  IERC20__factory as ERC20__factory,
  WormholeFacet,
  DexManagerFacet,
} from '../../typechain'
import { deployments, network, ethers } from 'hardhat'
import { constants, utils } from 'ethers'
import { node_url } from '../../utils/network'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers'
import approvedFunctionSelectors from '../../utils/approvedFunctions'

const ETH_WHALE_ADDR = '0x6e685a45db4d97ba160fa067cb81b40dfed47245'
const USDT_ADDRESS = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
const WMATIC_ADDRESS = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'
const UNISWAP_ADDRESS = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff'

describe('WormholeFacet', function () {
  let lifi: WormholeFacet
  let alice: SignerWithAddress
  let lifiData: any
  let usdt: ERC20
  let dexMgr: DexManagerFacet
  let wmatic: ERC20
  let ethWhale: SignerWithAddress

  if (network.name != 'hardhat') {
    throw 'Only hardhat supported for testing'
  }

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture('DeployWormholeFacet')
      const diamond = await ethers.getContract('LiFiDiamond')
      lifi = <WormholeFacet>(
        await ethers.getContractAt('WormholeFacet', diamond.address)
      )
      dexMgr = <DexManagerFacet>(
        await ethers.getContractAt('DexManagerFacet', diamond.address)
      )
      await dexMgr.addDex(UNISWAP_ADDRESS)
      await dexMgr.batchSetFunctionApprovalBySignature(
        approvedFunctionSelectors,
        true
      )

      await network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: ['0x6722846282868a9c084b423aee79eb8ff69fc497'],
      })

      await network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ETH_WHALE_ADDR],
      })

      alice = await ethers.getSigner(
        '0x6722846282868a9c084b423aee79eb8ff69fc497'
      )

      ethWhale = await ethers.getSigner(ETH_WHALE_ADDR)

      wmatic = ERC20__factory.connect(WMATIC_ADDRESS, alice)
      usdt = ERC20__factory.connect(USDT_ADDRESS, alice)

      lifiData = {
        transactionId: utils.randomBytes(32),
        integrator: 'ACME Devs',
        referrer: constants.AddressZero,
        sendingAssetId: usdt.address,
        receivingAssetId: usdt.address,
        receiver: alice.address,
        destinationChainId: 137,
        amount: utils.parseEther('1.006'),
      }
      await usdt.approve(lifi.address, utils.parseUnits('1000', 6))
      // Gnosis
      await lifi.setWormholeChainId(100, 25)
      // Assigning Hardhat to eth mainnet
      await lifi.setWormholeChainId(1337, 2)
    }
  )

  before(async function () {
    this.timeout(0)
    await network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: node_url('polygon'),
            blockNumber: 25689963,
          },
        },
      ],
    })
  })

  beforeEach(async () => {
    await setupTest()
  })

  it('starts a bridge transaction on the sending chain', async () => {
    const WormholeData = {
      assetId: usdt.address,
      amount: utils.parseUnits('1000', 6),
      receiver: alice.address,
      toChainId: 100,
      arbiterFee: 0,
      nonce: 342,
    }
    await lifi
      .connect(alice)
      .startBridgeTokensViaWormhole(lifiData, WormholeData, {
        gasLimit: 500000,
      })
  })

  it('starts a bridge transaction on the sending chain (native)', async () => {
    const WormholeData = {
      wormholeRouter: WORMHOLE_ROUTER,
      token: ethers.constants.AddressZero,
      amount: utils.parseUnits('1000', 6),
      recipient: ethWhale.address,
      toChainId: 100,
      arbiterFee: 0,
      nonce: 342,
    }
    await lifi
      .connect(ethWhale)
      .startBridgeTokensViaWormhole(lifiData, WormholeData, {
        gasLimit: 500000,
        value: utils.parseUnits('1000', 6),
      })
  })

  it('performs a swap then starts bridge transaction on the sending chain', async () => {
    const to = lifi.address // should be a checksummed receiver address
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20 // 20 minutes from the current Unix time

    const iface = new utils.Interface([
      'function swapETHForExactTokens(uint,address[],address,uint256)',
    ])

    // Generate swap calldata
    const uniswapData = iface.encodeFunctionData('swapETHForExactTokens', [
      utils.parseUnits('1000', 6),
      [wmatic.address, usdt.address],
      to,
      deadline,
    ])

    const swapData = [
      {
        callTo: UNISWAP_ADDRESS,
        approveTo: UNISWAP_ADDRESS,
        sendingAssetId: '0x0000000000000000000000000000000000000000',
        receivingAssetId: usdt.address,
        fromAmount: utils.parseEther('700'),
        callData: uniswapData,
      },
    ]

    const WormholeData = {
      assetId: usdt.address,
      amount: utils.parseUnits('1000', 6),
      receiver: alice.address,
      toChainId: 100,
      arbiterFee: 0,
      nonce: 221,
    }

    await lifi
      .connect(alice)
      .swapAndStartBridgeTokensViaWormhole(lifiData, swapData, WormholeData, {
        gasLimit: 500000,
        value: utils.parseEther('700'),
      })
  })
})
