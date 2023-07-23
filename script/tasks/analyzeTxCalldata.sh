#!/bin/bash

function_identifier_l1=""
rpc_url=""

analyzeTxCalldata() {
  # load deploy script & helper functions
  source .env
  source script/config.sh
  source script/helperFunctions.sh

  # get user-selected network from list
#  network=$(cat ./networks | gum filter --placeholder "Network")
#  if [[ -z "$network" ]]; then
#   error "invalid selection - exiting script"
#   exit 1
#  fi
#  echo "[info] selected network: $network"
  network="mainnet"

  # get RPC URL for given network
  rpc_url=$(getRPCUrl "$network")

  # get tx hash
#  echo "Please enter the transaction hash that should be analzed:"
#  read -r tx_hash
#  tx_hash="0x2fad205bf003a6da05fb8e3c6f0e8ad58e946c211768b4acf3f4e93262ca1ed3"
#  tx_hash="0x1faeacf54b1625fe802e78da0802146faea9303a73ba9bcf2db4d1db04ddfba4"
  tx_hash="0xbe7c36ff4233ba11e00a83d8a258543a1c59ba9b1b3d7af284e2c8cc273b1724" # HopFacet
#  tx_hash="0xef754884439db24def30a03645a49ceb2164a8989b6184ebb63306cc69ed2dca" # Across
#  tx_hash="0xa45e5e12e2a8d2dc5e5bbf2d0f03be2f004e721b9c0187a5a61d8890ff705a83" # OptimismBridge

  echo "[info] Obtaining calldata for tx $tx_hash in network $network now"

  # get tx details
  tx=$(cast tx $tx_hash --rpc-url "$rpc_url")

  # extract calldata (aka "input")
  calldata=$(echo "$tx" | awk '/input/{print substr($0, index($0,$2))}')

  # extract function identifier
  function_identifier_l1=${calldata:0:10}
  echo "f_id: $function_identifier_l1"


  # look up function identifier in signature database
  result=$(curl -s -X 'GET' \
    "https://api.openchain.xyz/signature-database/v1/lookup?function=$function_identifier_l1&filter=true" \
    -H 'accept: application/json')

  # extract function signature
  function_signature_l1=$(echo $result | jq -r '.result.function[] | .[0].name')

#  if [[ "swap" == *"$function_signature_l1"* ]];then
  if [[ $function_signature_l1 == *"swap"* ]];then
    contains_swap=true
  fi

  # decode calldata with function signature
  decoded_calldata=$(cast --calldata-decode "$function_signature_l1" "$calldata")

  echo ""

  # break up decoded calldata into bridgeData, swapData and facetData
  # Convert string into an array using newline as the separator
  IFS=$'\n' read -d '' -r -a parts <<< "$decoded_calldata"

  # Check number of parts and assign to variables
  num_parts=${#parts[@]}

  if [[ $num_parts -ge 1 ]]; then
    bridge_data=$(removeScientificAndANSI "${parts[0]}")
    printBridgeData "$bridge_data"
  fi

  # if swapData exists, print it
  if [[ $num_parts -ge 2 ]]; then
    if [[ $contains_swap == "true" ]];then
      swap_data=$(removeScientificAndANSI "${parts[1]}")

      # remove the enclosing brackets and replace "), (" with "|"
      parts=$(echo "$swap_data" | tr -d '[]' | sed 's/), (/\|/g')

      # replace "|" with newlines
      parts=$(echo "$parts" | tr '|' '\n')

      # now you can loop over the parts
      while read -r line; do
          echo ""
          printSwapData "$line" "$network"
      done <<< "$parts"
    else
      facet_data=$(removeScientificAndANSI "${parts[1]}")
      printFacetData "$facet_data" "$network"
    fi
  fi

  # if facetData exists, print it
  if [[ $num_parts -ge 3 ]]; then
    facet_data=$(removeScientificAndANSI "${parts[2]}")
    printFacetData "$facet_data" "$network"
  fi

  echo ""
  echo ""


}

function removeScientificAndANSI() {
  # read function arguments into variables
  string="$1"

  # remove scientific notation
  string=$(echo "$string" | sed -E 's/\s*\[[0-9]+(\.[0-9]*)?[eE][0-9]+\]//g')
  # remove ANSI escape sequences
  string=$(echo "$string" | sed $'s,\x1b\\[[0-9;]*[a-zA-Z],,g')
  # remove leading space before comma
  string=$(echo "$string" | sed 's/ ,/,/g')

  # return cleaned string
  echo "$string"
}

function printBridgeData() {
  # read function arguments into variables
  local string="$1"

  # remove parentheses
  bridge_data=$(echo "$string" | tr -d '()')

  # Split string into array
  IFS=', ' read -ra values <<< "$bridge_data"

  # store values in variables
  bridge_data_transactionId="${values[0]}"
  bridge_data_bridge="${values[1]}"
  bridge_data_integrator="${values[2]}"
  bridge_data_referrer="${values[3]}"
  bridge_data_sendingAssetId="${values[4]}"
  bridge_data_receiver="${values[5]}"
  bridge_data_minAmount="${values[6]}"
  bridge_data_destinationChainId="${values[7]}"
  bridge_data_hasSourceSwaps="${values[8]}"
  bridge_data_hasDestinationCall="${values[9]}"


  printf "BridgeData:\n"
  printf "%-30s %s\n" "transactionId" "$bridge_data_transactionId"
  printf "%-30s %s\n" "bridge" "$bridge_data_bridge"
  printf "%-30s %s\n" "integrator" "$bridge_data_integrator"
  printf "%-30s %s\n" "referrer" "$bridge_data_referrer"
  printf "%-30s %-30s %s\n" "sendingAssetId" "$bridge_data_sendingAssetId" "$(getContractNameFromAddressThroughBlockExplorer "$bridge_data_sendingAssetId" "$network")"
  printf "%-30s %s\n" "receiver" "$bridge_data_receiver"
  printf "%-30s %s\n" "minAmount" "$bridge_data_minAmount"
  printf "%-30s %s\n" "destinationChainId" "$bridge_data_destinationChainId" # TODO: add chain name here?
  printf "%-30s %s\n" "hasSourceSwaps" "$bridge_data_hasSourceSwaps"
  printf "%-30s %s\n" "hasDestinationCall" "$bridge_data_hasDestinationCall"
  printf "\n\n"
}

function printSwapData() {
  # read function arguments into variables
  local string="$1"
  local network="$2"

  # remove parentheses
  string=$(echo "$string" | tr -d '()')

  # Split string into array
  IFS=', ' read -ra values <<< "$string"

  printf "SwapData:\n"
  printf "%-30s %-30s %s\n" "callTo" "${values[0]}" "$(getContractNameFromAddressThroughBlockExplorer "${values[0]}" "$network")"
  printf "%-30s %-30s %s\n" "approveTo" "${values[1]}" "$(getContractNameFromAddressThroughBlockExplorer "${values[1]}" "$network")"
  printf "%-30s %-30s %s\n" "sendingAssetId" "${values[2]}"  "$(getContractNameFromAddressThroughBlockExplorer "${values[2]}" "$network")"
  printf "%-30s %-30s\n" "receivingAssetId" "${values[3]}"
  printf "%-30s %s\n" "fromAmount" "${values[4]}"
  printf "%-30s %s\n" "callData" "${values[5]}"
  printf "%-30s %s\n" "requiresDeposit" "${values[6]}"
  printf "\n\n"

  

}

function printFacetData() {
  # read function arguments into variables
  local string="$1"
  local network="$2"

  # remove parentheses
  string=$(echo "$string" | tr -d '()')

  # list the function identifiers for all facets
  acrossFacet="1fd8010c,3a3f7332"
  allBridgeFacet="e40f2460,a74ccb35"
  amarokFacet="8dc9932d,83f31917"
  arbitrumBridgeFacet="c9851d0b,3cc9517b"
  cBridgeFacet="ae0b91e5,482c6a85"
  celerImFacet="05095ded,b06c52da"
  circleBridgeFacet="02d452ab,e9017dc5"
  deBridgeFacet="5fcb0260,be3d5ec5"
  gravityFacet=",31191ec3,eca3735c"
  hopFacetOptimized="082bc047,03add8c3,0b4cb5d8,55c99cd8,42afe79a,8d03f456,d40e64cc,ca360ae0"
  multichainFacet="ef55f6dd,a342d3ff"
  oftWrapperFacet="b5bdbe90,1b4a9df3"
  optimismBridgeFacet="ce8a97a5,5bb5d448"
  squidFacet="f85856af,6a0f3cbd"
  stargateFacet="be1eace7,ed178619"
  synapseBridgeFacet="9700ad75,7d9dd78b"
  thorSwapFacet="2541ec57,ad673d88"
  wormholeFacet="65c958d4,ac3dcc95"

  # remove leading "0x" from identifier
  stripped_identifier_l1=${function_identifier_l1#0x}

  # call the correct function based on which facet was identified
  if [[ $acrossFacet == *"$stripped_identifier_l1"* ]]; then
    printAcrossData "$string" "$network"
  elif [[ $allBridgeFacet == *"$stripped_identifier_l1"* ]]; then
    printAllBridgeData "$string" "$network"
  elif [[ $amarokFacet == *"$stripped_identifier_l1"* ]]; then
    printAmarokData "$string" "$network"
  elif [[ $arbitrumBridgeFacet == *"$stripped_identifier_l1"* ]]; then
    printArbitrumData "$string" "$network"
  elif [[ $cBridgeFacet == *"$stripped_identifier_l1"* ]]; then
    printCBridgeData "$string" "$network"
  elif [[ $celerImFacet == *"$stripped_identifier_l1"* ]]; then
    printCelerImData "$string" "$network"
  elif [[ $circleBridgeFacet == *"$stripped_identifier_l1"* ]]; then
    printCircleBridgeData "$string" "$network"
  elif [[ $deBridgeFacet == *"$stripped_identifier_l1"* ]]; then
    printDeBridgeData "$string" "$network"
  elif [[ $gravityFacet == *"$stripped_identifier_l1"* ]]; then
    printGravityData "$string" "$network"
  elif [[ $hopFacetOptimized == *"$stripped_identifier_l1"* ]]; then
    printHopFacetOptimizedData "$string" "$network"
  elif [[ $multichainFacet == *"$stripped_identifier_l1"* ]]; then
    printMultichainData "$string" "$network"
  elif [[ $oftWrapperFacet == *"$stripped_identifier_l1"* ]]; then
    printOftWrapperData "$string" "$network"
  elif [[ $optimismBridgeFacet == *"$stripped_identifier_l1"* ]]; then
    printOptimismData "$string" "$network"
  elif [[ $squidFacet == *"$stripped_identifier_l1"* ]]; then
    printSquidData "$string" "$network"
  elif [[ $stargateFacet == *"$stripped_identifier_l1"* ]]; then
    printStargateData "$string" "$network"
  elif [[ $synapseBridgeFacet == *"$stripped_identifier_l1"* ]]; then
    printSynapseBridgeData "$string" "$network"
  elif [[ $thorSwapFacet == *"$stripped_identifier_l1"* ]]; then
    printThorSwapData "$string" "$network"
  elif [[ $wormholeFacet == *"$stripped_identifier_l1"* ]]; then
    printWormholeData "$string" "$network"
  else
    echo "could not find facet for function identifier: $function_identifier_l1"
  fi
}

function printAcrossData() {
  # read function arguments into variables
  local string=$1
  local network="$2"

  # Split string into array
  IFS=', ' read -ra values <<< "$string"

  printf "AcrossData:\n"
  printf "%-30s %s\n" "relayerFeePct" "${values[0]}"
  printf "%-30s %s\n" "quoteTimestamp" "${values[1]}"
  printf "%-30s %s\n" "message" "${values[2]}"
  printf "%-30s %s\n" "maxCount" "${values[3]}"
  printf "\n\n"
}

function printAllBridgeData() {
  # read function arguments into variables
  local string=$1
  local network="$2"

  # Split string into array
  IFS=', ' read -ra values <<< "$string"

  printf "AllBridgeData:\n"
  printf "%-30s %s\n" "fees" "${values[0]}"
  printf "%-30s %s\n" "recipient" "${values[1]}"
  printf "%-30s %s\n" "destinationChainId" "${values[2]}"
  printf "%-30s %s\n" "receiveToken" "${values[3]}"
  printf "%-30s %s\n" "nonce" "${values[4]}"
  printf "%-30s %s\n" "messenger" "${values[5]}"
  printf "%-30s %s\n" "payFeeWithSendingAsset" "${values[6]}"
  printf "\n\n"
}

function printAmarokData() {
  # read function arguments into variables
  local string=$1
  local network="$2"

  # Split string into array
  IFS=', ' read -ra values <<< "$string"

  printf "AmarokData:\n"
  printf "%-30s %s\n" "callData" "${values[0]}"
  printf "%-30s %-30s %s\n" "callTo" "${values[1]}" "$(getContractNameFromAddressThroughBlockExplorer "${values[1]}" "$network")"
  printf "%-30s %s\n" "relayerFee" "${values[2]}"
  printf "%-30s %s\n" "slippageTol" "${values[3]}"
  printf "%-30s %-30s %s\n" "delegate" "${values[4]}" "$(getContractNameFromAddressThroughBlockExplorer "${values[4]}" "$network")"
  printf "%-30s %s\n" "destChainDomainId" "${values[5]}"
  printf "%-30s %s\n" "payFeeWithSendingAsset" "${values[6]}"
  printf "\n\n"
}

function printArbitrumData() {
  # read function arguments into variables
  local string=$1
  local network="$2"

  # Split string into array
  IFS=', ' read -ra values <<< "$string"

  printf "ArbitrumData:\n"
  printf "%-30s %s\n" "maxSubmissionCost" "${values[0]}"
  printf "%-30s %s\n" "maxGas" "${values[1]}"
  printf "%-30s %s\n" "maxGasPrice" "${values[2]}"
  printf "\n\n"
}

function printCBridgeData() {
  # read function arguments into variables
  local string=$1
  local network="$2"

  # Split string into array
  IFS=', ' read -ra values <<< "$string"

  printf "CBridgeData:\n"
  printf "%-30s %s\n" "maxSlippage" "${values[0]}"
  printf "%-30s %s\n" "nonce" "${values[1]}"
  printf "\n\n"
}

function printCelerIMData() {
  # read function arguments into variables
  local string=$1
  local network="$2"

  # Split string into array
  IFS=', ' read -ra values <<< "$string"

  printf "CelerIMData:\n"
  printf "%-30s %s\n" "maxSlippage" "${values[0]}"
  printf "%-30s %s\n" "nonce" "${values[1]}"
  printf "%-30s %s\n" "callTo" "${values[2]}"
  printf "%-30s %s\n" "callData" "${values[3]}"
  printf "%-30s %s\n" "messageBusFee" "${values[4]}"
  printf "%-30s %s\n" "bridgeType" "${values[5]}"
  printf "\n\n"
}

function printCircleBridgeData() {
  # read function arguments into variables
  local string=$1
  local network="$2"

  # Split string into array
  IFS=', ' read -ra values <<< "$string"

  printf "CircleBridgeData:\n"
  printf "%-30s %s\n" "dstDomain" "${values[0]}"
  printf "\n\n"
}

function printDeBridgeData() {
  # read function arguments into variables
  local string=$1
  local network="$2"

  # Split string into array
  IFS=', ' read -ra values <<< "$string"

  printf "DeBridgeData:\n"
  printf "%-30s %s\n" "nativeFee" "${values[0]}"
  printf "%-30s %s\n" "useAssetFee" "${values[1]}"
  printf "%-30s %s\n" "referralCode" "${values[2]}"
  printf "%-30s %s\n" "autoParams" "${values[3]}"  # TODO: test and split up in elements
  printf "\n\n"
}

function printGravityData() {
  # read function arguments into variables
  local string=$1
  local network="$2"

  # Split string into array
  IFS=', ' read -ra values <<< "$string"

  printf "GravityData:\n"
  printf "%-30s %s\n" "destinationAddress" "${values[0]}"
  printf "\n\n"
}

function printHopFacetOptimizedData() {
  # read function arguments into variables
  local string=$1
  local network="$2"

  # Split string into array
  IFS=', ' read -ra values <<< "$string"

  printf "HopData (HopFacetOptimized):\n"
  printf "%-30s %s\n" "bonderFee" "${values[0]}"
  printf "%-30s %s\n" "amountOutMin" "${values[1]}"
  printf "%-30s %s\n" "deadline" "${values[2]}"
  printf "%-30s %s\n" "destinationAmountOutMin" "${values[3]}"
  printf "%-30s %s\n" "destinationDeadline" "${values[4]}"
#  printf "%-30s %s\n" "hopBridge" "${values[5]}"
  printf "%-30s %-30s %s\n" "hopBridge" "${values[5]}" "$(getContractNameFromAddressThroughBlockExplorer "${values[5]}" "$network")"
  printf "%-30s %-30s %s\n" "relayer" "${values[6]}" "$(getContractNameFromAddressThroughBlockExplorer "${values[6]}" "$network")"
  printf "%-30s %s\n" "relayerFee" "${values[7]}"
  printf "%-30s %s\n" "nativeFee" "${values[8]}"
  printf "\n\n"
}

function printMultichainData() {
  # read function arguments into variables
  local string=$1
  local network="$2"

  # Split string into array
  IFS=', ' read -ra values <<< "$string"

  printf "MultichainData:\n"
  printf "%-30s %-30s %s\n" "router" "${values[0]}" "$(getContractNameFromAddressThroughBlockExplorer "${values[0]}" "$network")"
  printf "\n\n"
}

function printOFTWrapperData() {
  # read function arguments into variables
  local string=$1
  local network="$2"

  # Split string into array
  IFS=', ' read -ra values <<< "$string"

  printf "OFTWrapperData:\n"
  printf "%-30s %s\n" "tokenType" "${values[0]}"
  printf "%-30s %-30s %s\n" "proxyOFT" "${values[1]}" "$(getContractNameFromAddressThroughBlockExplorer "${values[1]}" "$network")"
  printf "%-30s %s\n" "receiver" "${values[2]}"
  printf "%-30s %s\n" "minAmount" "${values[3]}"
  printf "%-30s %s\n" "lzFee" "${values[4]}"
  printf "%-30s %s\n" "adapterParams" "${values[5]}"
  printf "\n\n"
}

function printOptimismData() {
  # read function arguments into variables
  local string=$1
  local network="$2"

  # Split string into array
  IFS=', ' read -ra values <<< "$string"

  printf "OptimismData:\n"
  printf "%-30s %-30s %s\n" "assetIdOnL2" "${values[0]}"
  printf "%-30s %s\n" "l2Gas" "${values[1]}"
  printf "%-30s %s\n" "isSynthetix" "${values[2]}"
  printf "\n\n"
}

function printSquidData() {
  # read function arguments into variables
  local string=$1
  local network="$2"

  # Split string into array
  IFS=', ' read -ra values <<< "$string"

  printf "SquidData:\n"
  printf "%-30s %-30s %s\n" "routeType" "${values[0]}"
  printf "%-30s %s\n" "destinationChain" "${values[1]}"
  printf "%-30s %s\n" "bridgedTokenSymbol" "${values[2]}"
  printf "%-30s %s\n" "sourceCalls" "${values[3]}" # TODO: split up
  printf "%-30s %s\n" "destinationCalls" "${values[4]}" # TODO: split up
  printf "%-30s %s\n" "fee" "${values[5]}"
  printf "%-30s %s\n" "forecallEnabled" "${values[6]}"
  printf "\n\n"
}

function printStargateData() {
  # read function arguments into variables
  local string=$1
  local network="$2"

  # Split string into array
  IFS=', ' read -ra values <<< "$string"

  printf "StargateData:\n"
  printf "%-30s %s\n" "srcPoolId" "${values[0]}"
  printf "%-30s %s\n" "dstPoolId" "${values[1]}"
  printf "%-30s %s\n" "minAmountLD" "${values[2]}"
  printf "%-30s %s\n" "dstGasForCall" "${values[3]}"
  printf "%-30s %s\n" "lzFee" "${values[4]}"
  printf "%-30s %s\n" "refundAddress" "${values[5]}"
  printf "%-30s %s\n" "callTo" "${values[6]}"
  printf "%-30s %s\n" "callData" "${values[7]}"
  printf "\n\n"
}

function printSynapseData() {
  # read function arguments into variables
  local string=$1
  local network="$2"

  # Split string into array
  IFS=', ' read -ra values <<< "$string"

  printf "SynapseData:\n"
  printf "%-30s %s\n" "originQuery" "${values[0]}"  # TODO: split up
  printf "%-30s %s\n" "destQuery" "${values[1]}" # TODO: split up
  printf "\n\n"
}

function printThorSwapData() {
  # read function arguments into variables
  local string=$1
  local network="$2"

  # Split string into array
  IFS=', ' read -ra values <<< "$string"

  printf "ThorSwapData:\n"
  printf "%-30s %-30s %s\n" "vault" "${values[0]}" "$(getContractNameFromAddressThroughBlockExplorer "${values[0]}" "$network")"
  printf "%-30s %s\n" "memo" "${values[1]}"
  printf "%-30s %s\n" "expiration" "${values[2]}"
  printf "\n\n"
}

function printWormholeData() {
  # read function arguments into variables
  local string=$1
  local network="$2"

  # Split string into array
  IFS=', ' read -ra values <<< "$string"

  printf "WormholeData:\n"
  printf "%-30s %s\n" "receiver" "${values[0]}"
  printf "%-30s %s\n" "arbiterFee" "${values[1]}"
  printf "%-30s %s\n" "nonce" "${values[2]}"
  printf "\n\n"
}

analyzeTxCalldata
