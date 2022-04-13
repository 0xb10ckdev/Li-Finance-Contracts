/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  HyphenFacet,
  IERC20 as ERC20,
  IERC20__factory as ERC20__factory,
  DexManagerFacet,
} from '../../typechain'
import { deployments, ethers, network } from 'hardhat'
import { constants, utils } from 'ethers'
import { node_url } from '../../utils/network'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers'
import approvedFunctionSelectors from '../../utils/approvedFunctions'

const USDC_ADDRESS = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174'
const WMATIC_ADDRESS = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'
const UNISWAP_ADDRESS = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff'

describe('HyphenFacet', function () {
  let lifi: HyphenFacet
  let dexMgr: DexManagerFacet
  let alice: SignerWithAddress
  let lifiData: any
  let usdc: ERC20
  let wmatic: ERC20

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      // setup contract
      await deployments.fixture('DeployHyphenFacet')
      const diamond = await ethers.getContract('LiFiDiamond')
      lifi = <HyphenFacet>(
        await ethers.getContractAt('HyphenFacet', diamond.address)
      )
      dexMgr = <DexManagerFacet>(
        await ethers.getContractAt('DexManagerFacet', diamond.address)
      )
      await dexMgr.addDex(UNISWAP_ADDRESS)
      await dexMgr.batchSetFunctionApprovalBySignature(
        approvedFunctionSelectors,
        true
      )

      // setup user
      const wealthyAccount = '0xf977814e90da44bfa03b6295a0616a897441acec'
      await network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [wealthyAccount],
      })
      alice = await ethers.getSigner(wealthyAccount)

      // setup tokens
      wmatic = ERC20__factory.connect(WMATIC_ADDRESS, alice)
      usdc = ERC20__factory.connect(USDC_ADDRESS, alice)

      lifiData = {
        transactionId: utils.randomBytes(32),
        integrator: 'ACME Devs',
        referrer: constants.AddressZero,
        sendingAssetId: usdc.address,
        receivingAssetId: usdc.address,
        receiver: alice.address,
        destinationChainId: 43114,
        amount: utils.parseUnits('10', 6),
      }
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
            blockNumber: 26593207,
          },
        },
      ],
    })
  })

  beforeEach(async () => {
    await setupTest()
  })

  it('starts a bridge transaction on the sending chain', async () => {
    const amount = utils.parseUnits('10', 6)
    const hyphenData = {
      token: usdc.address,
      amount: amount,
      recipient: alice.address,
      toChainId: 43114,
    }
    await usdc.approve(lifi.address, amount)
    await lifi.connect(alice).startBridgeTokensViaHyphen(lifiData, hyphenData, {
      gasLimit: 500000,
    })
  })

  it('performs a swap then starts bridge transaction on the sending chain', async () => {
    const to = lifi.address // should be a checksummed recipient address
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20 // 20 minutes from the current Unix time

    const amountETH = utils.parseEther('700')
    const amountUSDC = utils.parseUnits('1000', 6)

    const iface = new utils.Interface([
      'function swapETHForExactTokens(uint,address[],address,uint256)',
    ])

    // Generate swap calldata
    const uniswapData = iface.encodeFunctionData('swapETHForExactTokens', [
      amountUSDC,
      [wmatic.address, usdc.address],
      to,
      deadline,
    ])

    const swapData = [
      {
        callTo: UNISWAP_ADDRESS,
        approveTo: UNISWAP_ADDRESS,
        sendingAssetId: ethers.constants.AddressZero,
        receivingAssetId: usdc.address,
        fromAmount: amountETH,
        callData: uniswapData,
      },
    ]

    const hyphenData = {
      token: usdc.address,
      amount: amountUSDC,
      recipient: alice.address,
      toChainId: 43114,
    }

    await lifi
      .connect(alice)
      .swapAndStartBridgeTokensViaHyphen(lifiData, swapData, hyphenData, {
        gasLimit: 500000,
        value: amountETH,
      })
  })
})
